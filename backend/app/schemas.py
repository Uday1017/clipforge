from typing import List, Optional
from pydantic import BaseModel, Field

class TranscriptSegment(BaseModel):
    """
    Represents a single segment of transcribed text with start and end timestamps.
    """
    start: float = Field(..., description="Start timestamp of the segment in seconds")
    end: float = Field(..., description="End timestamp of the segment in seconds")
    text: str = Field(..., description="The transcribed text content of the segment")

class VideoChapter(BaseModel):
    """
    Represents a single generated chapter for the video.
    """
    start_time: float = Field(..., description="Start time of the chapter in seconds")
    end_time: float = Field(..., description="End time of the chapter in seconds")
    title: str = Field(..., description="Title of the chapter")
    summary: str = Field(..., description="Brief summary of the chapter content")
    keywords: List[str] = Field(default_factory=list, description="Keywords or tags relevant to the chapter")

class ChapterGenerationResponse(BaseModel):
    """
    The response payload containing all generated chapters for a video.
    """
    video_id: str = Field(..., description="Unique identifier of the video")
    total_duration: float = Field(..., description="Total duration of the video in seconds")
    chapters: List[VideoChapter] = Field(..., description="List of generated video chapters")

class JobStatusResponse(BaseModel):
    """
    Represents the status of an asynchronous chapter generation job.
    """
    job_id: str = Field(..., description="Unique identifier for the asynchronous job")
    status: str = Field(..., description="Current status of the job (e.g., 'processing', 'completed', 'failed')")
    progress_percentage: int = Field(..., description="Progress of the job as a percentage (0 to 100)")
    result: Optional[ChapterGenerationResponse] = Field(None, description="The generation result, populated only if status is 'completed'")
