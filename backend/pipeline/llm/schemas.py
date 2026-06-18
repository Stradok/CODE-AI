"""
pipeline/llm/schemas.py - Pydantic models for LLM output validation.

Each pipeline stage has a defined output schema.  LangChain output parsers
use these models to validate and structure LLM responses.  All fields carry
defaults so that partially-complete LLM output is accepted gracefully.
"""

from pydantic import BaseModel, Field


class VulnerabilityItem(BaseModel):
    """A single vulnerability detected in the source code."""

    name: str = Field(default="", description="Name/type of the vulnerability")
    cves: list[str] = Field(default_factory=list, description="Related CVE identifiers")
    description: str = Field(default="", description="Short summary of the vulnerability")
    exploitability: str = Field(
        default="Medium", description="Exploitability rating: High, Medium, or Low"
    )
    reason: str = Field(default="", description="Why the vulnerability exists in this code")
    remediation: str = Field(
        default="", description="Permanent fix — the secure coding change to apply"
    )
    mitigation: str = Field(default="", description="Short-term workaround to reduce risk")


class RAGAnalysisOutput(BaseModel):
    """Output schema for the RAG vulnerability analysis stage."""

    vulnerabilities: list[VulnerabilityItem] = Field(
        default_factory=list, description="List of detected vulnerabilities"
    )


class ValidatedVulnerabilityItem(VulnerabilityItem):
    """A vulnerability with validation status."""

    status: str = Field(default="confirmed", description="Validation status")


class ValidatorOutput(BaseModel):
    """Output schema for the validation stage."""

    validated: bool = Field(default=False, description="Whether any vulnerabilities were confirmed")
    vulnerabilities: list[ValidatedVulnerabilityItem] = Field(
        default_factory=list, description="Confirmed vulnerabilities"
    )


class RecommenderFixOutput(BaseModel):
    """Output schema for the recommender fix generation."""

    fixed_code: str = Field(description="The complete patched function code")
    explanation: str = Field(default="", description="How the fix addresses each vulnerability")
