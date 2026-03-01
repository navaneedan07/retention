import os
import random
import importlib.util
from typing import List, Dict, Optional, Any

import numpy as np

if importlib.util.find_spec("cv2") is not None:
    cv2 = __import__("cv2")
else:
    cv2 = None

if importlib.util.find_spec("librosa") is not None:
    librosa = __import__("librosa")
else:
    librosa = None

if importlib.util.find_spec("moviepy") is not None:
    try:
        from moviepy.video.io.VideoFileClip import VideoFileClip
    except Exception:
        VideoFileClip = None
else:
    VideoFileClip = None


def _clip01(value: float) -> float:
    return float(max(0.0, min(1.0, value)))


class VideoMetricExtractor:
    """
    Extracts measurable friction signals from MP4 when dependencies are available.
    Falls back to synthetic signal generation for prototype continuity.
    """

    def extract_metrics(
        self,
        video_path: Optional[str] = None,
        video_duration: Optional[int] = None,
    ) -> Dict[str, Any]:
        synthetic_duration = int(video_duration) if video_duration and video_duration > 0 else 60

        if not video_path:
            synthetic = self._extract_synthetic(synthetic_duration)
            synthetic["mode_reason"] = "no_video_path"
            return synthetic

        if not os.path.exists(video_path):
            synthetic = self._extract_synthetic(synthetic_duration)
            synthetic["mode_reason"] = "video_path_not_found"
            return synthetic

        if cv2 is not None:
            try:
                video = self._extract_from_video(video_path, max_duration=video_duration)
                video["mode_reason"] = "video_extraction_success_cv2"
                return video
            except Exception:
                pass

        if VideoFileClip is not None:
            try:
                video = self._extract_from_video_moviepy(video_path, max_duration=video_duration)
                video["mode_reason"] = "video_extraction_success_moviepy"
                return video
            except Exception:
                pass

        synthetic = self._extract_synthetic(synthetic_duration)
        synthetic["mode_reason"] = "video_decode_failed"
        return synthetic

    def _extract_synthetic(self, video_duration: int) -> Dict[str, Any]:
        timeline = []

        for t in range(video_duration):
            hook_strength = 0.9 if t < 5 else 0.55
            motion_intensity = random.uniform(0.35, 0.8)
            silence_ratio = 0.0
            face_ratio = random.uniform(0.45, 1.0)

            if 20 <= t <= 30:
                motion_intensity = random.uniform(0.0, 0.2)
                silence_ratio = random.uniform(0.6, 0.9)
                face_ratio = random.uniform(0.0, 0.2)

            timeline.append(
                {
                    "time": t,
                    "weak_hook_friction": _clip01(1.0 - hook_strength if t < 5 else 0.0),
                    "low_motion_friction": _clip01(1.0 - motion_intensity),
                    "high_silence_friction": _clip01(silence_ratio),
                    "low_face_friction": _clip01(1.0 - face_ratio),
                }
            )

        return {
            "timeline": timeline,
            "duration": video_duration,
            "mode": "synthetic",
            "metrics": {
                "scene_change_frequency": round(sum(1 for p in timeline if p["low_motion_friction"] < 0.45) / max(1, video_duration), 4),
                "motion_intensity": round(float(np.mean([1 - p["low_motion_friction"] for p in timeline])), 4),
                "face_presence_ratio": round(float(np.mean([1 - p["low_face_friction"] for p in timeline])), 4),
                "hook_strength": round(float(np.mean([1 - p["weak_hook_friction"] for p in timeline[:5]])), 4),
                "silence_ratio": round(float(np.mean([p["high_silence_friction"] for p in timeline])), 4),
            },
        }

    def _extract_from_video(self, video_path: str, max_duration: Optional[int] = None) -> Dict[str, Any]:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError("Unable to open video")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        duration = max(1, int(frame_count / fps)) if frame_count > 0 else 60
        if max_duration is not None and max_duration > 0:
            duration = min(duration, int(max_duration))

        prev_gray = None
        prev_hist = None

        motion_values = np.zeros(duration, dtype=float)
        scene_values = np.zeros(duration, dtype=float)
        face_values = np.zeros(duration, dtype=float)

        face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )

        for sec in range(duration):
            cap.set(cv2.CAP_PROP_POS_MSEC, float(sec * 1000))
            ok, frame = cap.read()
            if not ok:
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            hist = cv2.calcHist([gray], [0], None, [32], [0, 256])
            hist = cv2.normalize(hist, hist).flatten()

            if prev_gray is not None:
                diff = cv2.absdiff(gray, prev_gray)
                motion_values[sec] = float(np.mean(diff) / 255.0)

            if prev_hist is not None:
                scene_values[sec] = float(cv2.compareHist(prev_hist, hist, cv2.HISTCMP_BHATTACHARYYA))

            faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
            face_values[sec] = 1.0 if len(faces) > 0 else 0.0

            prev_gray = gray
            prev_hist = hist

        cap.release()

        max_motion = float(np.max(motion_values)) if np.max(motion_values) > 0 else 1.0
        max_scene = float(np.max(scene_values)) if np.max(scene_values) > 0 else 1.0
        motion_norm = np.array([_clip01(v / max_motion) for v in motion_values], dtype=float)
        scene_norm = np.array([_clip01(v / max_scene) for v in scene_values], dtype=float)
        face_norm = np.array([_clip01(v) for v in face_values], dtype=float)

        silence_per_sec = np.zeros(duration, dtype=float)
        energy_per_sec = np.zeros(duration, dtype=float)

        file_ext = os.path.splitext(video_path)[1].lower()
        should_extract_audio = librosa is not None and duration <= 90 and file_ext in {".mp4", ".m4v", ".webm", ".avi"}

        if should_extract_audio:
            try:
                y, sr = librosa.load(video_path, sr=22050, mono=True, duration=float(duration))
                rms = librosa.feature.rms(y=y).flatten()
                if len(rms) > 0:
                    frame_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr)
                    threshold = float(np.max(rms)) * 0.1
                    sec_buckets = [[] for _ in range(duration)]
                    for idx, value in enumerate(rms):
                        sec = int(frame_times[idx])
                        if 0 <= sec < duration:
                            sec_buckets[sec].append(float(value))

                    for sec in range(duration):
                        bucket = sec_buckets[sec]
                        if bucket:
                            sec_arr = np.array(bucket, dtype=float)
                            energy_per_sec[sec] = float(np.mean(sec_arr))
                            silence_per_sec[sec] = float(np.mean(sec_arr < threshold))
            except Exception:
                pass

        hook_strength = _clip01(
            float(
                0.45 * np.mean(motion_norm[: min(5, duration)])
                + 0.35 * np.mean(scene_norm[: min(5, duration)])
                + 0.20 * (1.0 - np.mean(silence_per_sec[: min(5, duration)]))
            )
        )

        timeline = []
        for t in range(duration):
            timeline.append(
                {
                    "time": t,
                    "weak_hook_friction": _clip01(1.0 - hook_strength if t < 5 else 0.0),
                    "low_motion_friction": _clip01(1.0 - motion_norm[t]),
                    "high_silence_friction": _clip01(silence_per_sec[t]),
                    "low_face_friction": _clip01(1.0 - face_norm[t]),
                }
            )

        scene_change_frequency = float(np.mean(scene_norm > 0.6))
        audio_energy_variation = float(np.std(energy_per_sec) / (np.mean(energy_per_sec) + 1e-6)) if np.mean(energy_per_sec) > 0 else 0.0

        return {
            "timeline": timeline,
            "duration": duration,
            "mode": "video",
            "metrics": {
                "scene_change_frequency": round(scene_change_frequency, 4),
                "motion_intensity": round(float(np.mean(motion_norm)), 4),
                "face_presence_ratio": round(float(np.mean(face_norm)), 4),
                "hook_strength": round(hook_strength, 4),
                "audio_energy": round(float(np.mean(energy_per_sec)), 4),
                "audio_energy_variation": round(audio_energy_variation, 4),
                "silence_ratio": round(float(np.mean(silence_per_sec)), 4),
                "video_length": duration,
            },
        }

    def _extract_from_video_moviepy(self, video_path: str, max_duration: Optional[int] = None) -> Dict[str, Any]:
        if VideoFileClip is None:
            raise ValueError("moviepy unavailable")

        clip = VideoFileClip(video_path)
        duration = max(1, int(clip.duration or 1))
        if max_duration is not None and max_duration > 0:
            duration = min(duration, int(max_duration))

        motion_values = np.zeros(duration, dtype=float)
        scene_values = np.zeros(duration, dtype=float)
        face_values = np.zeros(duration, dtype=float)

        prev_gray = None
        prev_hist = None

        face_cascade = None
        if cv2 is not None:
            face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            )

        for sec in range(duration):
            frame = clip.get_frame(min(sec, max(0.0, clip.duration - 1e-3)))
            frame = np.asarray(frame, dtype=np.uint8)

            if cv2 is not None:
                gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
                hist = cv2.calcHist([gray], [0], None, [32], [0, 256])
                hist = cv2.normalize(hist, hist).flatten()

                if prev_gray is not None:
                    diff = cv2.absdiff(gray, prev_gray)
                    motion_values[sec] = float(np.mean(diff) / 255.0)

                if prev_hist is not None:
                    scene_values[sec] = float(cv2.compareHist(prev_hist, hist, cv2.HISTCMP_BHATTACHARYYA))

                if face_cascade is not None:
                    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
                    face_values[sec] = 1.0 if len(faces) > 0 else 0.0

                prev_gray = gray
                prev_hist = hist
            else:
                gray = np.mean(frame, axis=2)
                if prev_gray is not None:
                    motion_values[sec] = float(np.mean(np.abs(gray - prev_gray)) / 255.0)
                face_values[sec] = 0.5
                prev_gray = gray

        max_motion = float(np.max(motion_values)) if np.max(motion_values) > 0 else 1.0
        max_scene = float(np.max(scene_values)) if np.max(scene_values) > 0 else 1.0
        motion_norm = np.array([_clip01(v / max_motion) for v in motion_values], dtype=float)
        scene_norm = np.array([_clip01(v / max_scene) for v in scene_values], dtype=float)
        face_norm = np.array([_clip01(v) for v in face_values], dtype=float)

        silence_per_sec = np.zeros(duration, dtype=float)
        energy_per_sec = np.zeros(duration, dtype=float)
        file_ext = os.path.splitext(video_path)[1].lower()
        should_extract_audio = librosa is not None and duration <= 90 and file_ext in {".mp4", ".m4v", ".webm", ".avi"}

        if should_extract_audio:
            try:
                y, sr = librosa.load(video_path, sr=22050, mono=True, duration=float(duration))
                rms = librosa.feature.rms(y=y).flatten()
                if len(rms) > 0:
                    frame_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr)
                    threshold = float(np.max(rms)) * 0.1
                    sec_buckets = [[] for _ in range(duration)]
                    for idx, value in enumerate(rms):
                        second = int(frame_times[idx])
                        if 0 <= second < duration:
                            sec_buckets[second].append(float(value))
                    for second in range(duration):
                        bucket = sec_buckets[second]
                        if bucket:
                            sec_arr = np.array(bucket, dtype=float)
                            energy_per_sec[second] = float(np.mean(sec_arr))
                            silence_per_sec[second] = float(np.mean(sec_arr < threshold))
            except Exception:
                pass

        hook_strength = _clip01(
            float(
                0.45 * np.mean(motion_norm[: min(5, duration)])
                + 0.35 * np.mean(scene_norm[: min(5, duration)])
                + 0.20 * (1.0 - np.mean(silence_per_sec[: min(5, duration)]))
            )
        )

        timeline = []
        for t in range(duration):
            timeline.append(
                {
                    "time": t,
                    "weak_hook_friction": _clip01(1.0 - hook_strength if t < 5 else 0.0),
                    "low_motion_friction": _clip01(1.0 - motion_norm[t]),
                    "high_silence_friction": _clip01(silence_per_sec[t]),
                    "low_face_friction": _clip01(1.0 - face_norm[t]),
                }
            )

        scene_change_frequency = float(np.mean(scene_norm > 0.6))
        audio_energy_variation = float(np.std(energy_per_sec) / (np.mean(energy_per_sec) + 1e-6)) if np.mean(energy_per_sec) > 0 else 0.0

        clip.close()

        return {
            "timeline": timeline,
            "duration": duration,
            "mode": "video",
            "metrics": {
                "scene_change_frequency": round(scene_change_frequency, 4),
                "motion_intensity": round(float(np.mean(motion_norm)), 4),
                "face_presence_ratio": round(float(np.mean(face_norm)), 4),
                "hook_strength": round(hook_strength, 4),
                "audio_energy": round(float(np.mean(energy_per_sec)), 4),
                "audio_energy_variation": round(audio_energy_variation, 4),
                "silence_ratio": round(float(np.mean(silence_per_sec)), 4),
                "video_length": duration,
            },
        }


class MockVideoMetricExtractor(VideoMetricExtractor):
    def extract_metrics(self, video_duration: int) -> Dict[str, Any]:
        return self._extract_synthetic(video_duration)
