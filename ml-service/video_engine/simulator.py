import numpy as np
import pandas as pd
from typing import Dict, List, Any

class Persona:
    def __init__(self, name: str, base_attention: float, decay_rate: float, friction_multiplier: float, drop_threshold: float, weight: float):
        self.name = name
        self.base_attention = base_attention
        self.decay_rate = decay_rate
        self.friction_multiplier = friction_multiplier
        self.drop_threshold = drop_threshold
        self.weight = weight # Proportion of audience

class VideoSimulator:
    def __init__(self):
        # 1. Define personas
        self.personas = [
            Persona("High Interest", base_attention=0.95, decay_rate=0.22, friction_multiplier=0.22, drop_threshold=0.22, weight=0.2),
            Persona("Average Interest", base_attention=0.78, decay_rate=0.45, friction_multiplier=0.35, drop_threshold=0.26, weight=0.5),
            Persona("Low Interest", base_attention=0.62, decay_rate=0.70, friction_multiplier=0.50, drop_threshold=0.30, weight=0.3)
        ]
        
    def simulate_retention(self, video_duration: int, friction_timeline: List[Dict[str, float]], weights: Dict[str, float]) -> Dict[str, Any]:
        """"
        friction_timeline: List of friction events per second. 
        Example: [{'time': 0, 'weak_hook': 0.8}, {'time': 1, 'weak_hook': 0.8}, ...]
        weights: Importance of each friction type.
        """
        
        timeline_results = []
        survival_rates = {p.name: True for p in self.personas}
        drop_times = {p.name: None for p in self.personas}
        below_threshold_streak = {p.name: 0 for p in self.personas}
        rolling_friction = 0.0

        friction_by_time = {int(item.get("time", idx)): item for idx, item in enumerate(friction_timeline)}
        duration_norm = max(video_duration, 60)
        
        for t in range(video_duration):
            time_point_data = {"time": t}
            
            # Get frictions for this second. If None, assume 0.
            current_frictions = friction_by_time.get(t, {})

            total_friction_penalty = sum(
                weights.get(k, 1.0) * v for k, v in current_frictions.items() if k != 'time'
            )

            rolling_friction = (0.85 * rolling_friction) + (0.15 * total_friction_penalty)
            
            retained_personas = 0
            weighted_attention = 0.0
            
            for p in self.personas:
                if not survival_rates[p.name]:
                    time_point_data[p.name + " Attention"] = 0
                    continue
                    
                # Attention(t) = base_attention - decay_rate * t - friction_multiplier * Σ(weight_i × friction_i)
                progress = t / duration_norm
                attention = p.base_attention - (p.decay_rate * progress) - (p.friction_multiplier * rolling_friction)
                attention = max(0.0, min(1.0, attention))
                
                if attention < p.drop_threshold:
                    below_threshold_streak[p.name] += 1
                else:
                    below_threshold_streak[p.name] = 0

                # Require sustained low-attention to mark a drop.
                if below_threshold_streak[p.name] >= 3:
                    survival_rates[p.name] = False
                    drop_times[p.name] = t
                    attention = 0
                else:
                    retained_personas += p.weight
                    
                time_point_data[p.name + " Attention"] = max(0, attention)
                weighted_attention += p.weight * max(0, attention)
                
            time_point_data["Overall Retention"] = weighted_attention
            timeline_results.append(time_point_data)
            
        final_retentions = {}
        for p in self.personas:
            if survival_rates[p.name]:
                final_retentions[p.name] = 100.0
            else:
                final_retentions[p.name] = float(drop_times[p.name] / video_duration) * 100.0
                
        overall_retention = sum((final_retentions[p.name] / 100.0) * p.weight for p in self.personas) * 100.0
                
        return {
            "timeline": timeline_results,
            "overall_retention": overall_retention,
            "persona_retention": final_retentions,
            "drop_times": drop_times
        }
