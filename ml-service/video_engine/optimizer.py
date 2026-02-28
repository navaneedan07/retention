from typing import List, Dict, Any
import copy
from .simulator import VideoSimulator

class OptimizationEngine:
    def __init__(self, simulator: VideoSimulator):
        self.simulator = simulator
        
    def generate_improvements(self, 
                              original_duration: int, 
                              original_timeline: List[Dict[str, float]], 
                              weights: Dict[str, float]) -> List[Dict[str, Any]]:
        
        # Base baseline
        base_result = self.simulator.simulate_retention(original_duration, original_timeline, weights)
        base_retention = base_result["overall_retention"]
        
        improvements = []
        
        # 1. Simulate: Strengthen first 5 seconds
        modified_timeline_hook = copy.deepcopy(original_timeline)
        for t in range(min(5, original_duration)):
            modified_timeline_hook[t]['weak_hook_friction'] = max(0.0, modified_timeline_hook[t]['weak_hook_friction'] - 0.5)
            
        hook_result = self.simulator.simulate_retention(original_duration, modified_timeline_hook, weights)
        hook_impact = hook_result["overall_retention"] - base_retention
        
        improvements.append({
            "name": "Strengthen first 5 seconds",
            "impact_percentage": round(hook_impact, 2),
            "description": "Increase hook strength in the first 5 seconds to reduce early drop-off.",
            "type": "visual"
        })
        
        # 2. Simulate: Reduce silence
        modified_timeline_silence = copy.deepcopy(original_timeline)
        for t in range(original_duration):
            modified_timeline_silence[t]['high_silence_friction'] = max(0.0, modified_timeline_silence[t]['high_silence_friction'] - 0.2)
            
        silence_result = self.simulator.simulate_retention(original_duration, modified_timeline_silence, weights)
        silence_impact = silence_result["overall_retention"] - base_retention
        
        improvements.append({
            "name": "Reduce silence by 20%",
            "impact_percentage": round(silence_impact, 2),
            "description": "Cut out dead air and long pauses.",
            "type": "audio"
        })
        
        # 3. Simulate: Increase motion/scene variation
        modified_timeline_motion = copy.deepcopy(original_timeline)
        for t in range(original_duration):
            modified_timeline_motion[t]['low_motion_friction'] = max(0.0, modified_timeline_motion[t]['low_motion_friction'] - 0.15)
            
        motion_result = self.simulator.simulate_retention(original_duration, modified_timeline_motion, weights)
        motion_impact = motion_result["overall_retention"] - base_retention
        
        improvements.append({
            "name": "Increase motion variation",
            "impact_percentage": round(motion_impact, 2),
            "description": "Add more b-roll, graphics, or cuts to increase dynamic engagement.",
            "type": "visual"
        })
        
        # Sort by impact
        improvements.sort(key=lambda x: x["impact_percentage"], reverse=True)
        
        return improvements
