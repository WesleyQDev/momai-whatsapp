from dataclasses import dataclass, field
import re
from typing import Set, List, Dict, Any, Optional

@dataclass
class StreamState:
    thread_id: str
    user_content: str
    summary_text: Optional[str] = None
    
    # Internal buffers
    tts_buffer: str = ""
    full_content: str = ""
    prebuffer: str = ""
    current_turn_buffer: str = ""
    
    # Stream control
    stream_decided: bool = False
    stream_suppressed: bool = False
    prebuffer_limit: int = 0
    
    # Trace and UI state
    activities_trace: List[str] = field(default_factory=list)
    tool_steps: List[Dict[str, Any]] = field(default_factory=list)
    shown_node_types: Set[str] = field(default_factory=set)
    had_tool_call: bool = False
    no_tools_available: Optional[bool] = None
    search_count: int = 0
    current_tool_segment: int = 0
    text_produced_since_last_tool: bool = False
    active_skill_name: Optional[str] = None
    
    # Final data
    pending_card: Optional[Dict[str, Any]] = None
    final_sources: Optional[List[Dict[str, Any]]] = None
    final_snippets: Optional[List[Dict[str, Any]]] = None
    final_cards: Optional[List[Dict[str, Any]]] = None

    # Patterns
    paragraph_pattern: re.Pattern = re.compile(r"(.*?\n{2,})", re.DOTALL)
    sentence_end_pattern: re.Pattern = re.compile(r"(.*?[.?!;])(?:\s+|$)", re.DOTALL)

    def add_activity(self, status: str, node_type: Optional[str] = None) -> bool:
        if node_type:
            if node_type in self.shown_node_types:
                return False
            self.shown_node_types.add(node_type)
        if status not in self.activities_trace:
            self.activities_trace.append(status)
            return True
        return False
