# HatchBot — Enterprise-Style RAG AI Knowledge Platform

**Technologies:** Python, FastAPI, OpenAI, Pinecone, AWS S3, PyMuPDF, pymupdf4llm, Trafilatura, LangChain, HuggingFace Embeddings

**Duration:** March 2025 – Present

## Project Overview

HatchBot is a Retrieval-Augmented Generation (RAG) platform designed to provide accurate, context-aware answers from external knowledge sources. The system supports ingestion of both PDF documents and web pages, automatically processes content into semantic knowledge chunks, indexes the knowledge into Pinecone vector databases, and uses Large Language Models (LLMs) to generate grounded responses based on retrieved context.

Unlike a traditional chatbot that relies only on pretrained knowledge, HatchBot implements a full document intelligence pipeline that continuously transforms raw content into searchable knowledge and combines retrieval with generation to reduce hallucinations and improve factual accuracy.

---

# System Architecture

The platform is designed as a modular, service-oriented pipeline with five major layers:

```text
Document Sources
      │
      ▼
Content Ingestion
      │
      ▼
Preprocessing & Extraction
      │
      ▼
Semantic Chunking & Embeddings
      │
      ▼
Vector Storage (Pinecone)
      │
      ▼
Retrieval Layer
      │
      ▼
LLM Generation Layer
```

Each layer is implemented as an independent module, allowing future scaling and replacement of individual components without affecting the rest of the system.

---

# High-Level Data Flow

## Stage 1: Content Acquisition

The system begins by fetching raw content from external sources.

Supported source types:

- HTML webpages
- PDF documents

The ingestion pipeline identifies content type automatically and routes content to the appropriate extraction engine.

```python
raw_doc = fetch(url)
extractor = get_extractor(raw_doc.content_type)
processed_doc = extractor.extract(raw_doc)
```

This routing architecture allows future support for:

- DOCX
- Markdown
- Notion pages
- Confluence
- Internal enterprise documents

without changing downstream processing logic.

---

# Stage 2: Document Processing Layer

## HTML Processing

For web content, HatchBot uses:

### Trafilatura

Trafilatura extracts the meaningful article content from webpages while removing:

- Navigation menus
- Advertisements
- Sidebars
- Boilerplate elements
- Comments

The extracted content is converted directly into Markdown format.

Additional metadata extraction includes:

- Title
- Author
- Publication date
- Language

This metadata is attached to downstream chunks for retrieval and ranking.

---

## PDF Processing

For PDFs, HatchBot uses:

### PyMuPDF

Used for:

- PDF parsing
- Document metadata extraction
- PDF structure inspection

### pymupdf4llm

Used to transform PDFs into LLM-friendly Markdown.

Advantages:

- Preserves document structure
- Preserves headings
- Preserves lists
- Preserves tables
- Produces significantly cleaner output than traditional OCR/text extraction

This design improves downstream chunking quality and retrieval accuracy.

---

# Stage 3: Semantic Chunking Layer

After extraction, the system transforms entire documents into semantically meaningful chunks.

Instead of fixed-size chunking:

```text
500 characters
500 characters
500 characters
```

HatchBot uses:

### LangChain SemanticChunker

The chunker analyzes semantic boundaries and attempts to split content where topic changes occur.

Benefits:

- Better retrieval quality
- Reduced context fragmentation
- More coherent chunks
- Higher relevance scores

Chunk metadata includes:

```json
{
  "chunk_id": "...",
  "document_id": "...",
  "source_url": "...",
  "title": "...",
  "chunk_index": 0,
  "content_hash": "...",
  "created_at": "..."
}
```

This enables future auditing and traceability.

---

# Stage 4: Embedding Infrastructure

The system supports multiple embedding providers through an abstraction layer.

## Embedding Collection Architecture

```text
EmbeddingCollection
        │
 ┌──────┴──────┐
 │             │
OpenAI     HuggingFace
```

Supported providers include:

### OpenAI Embeddings

Used for:

- High-quality semantic search
- Production-grade retrieval

### HuggingFace Embeddings

Used for:

- Cost reduction
- Offline experimentation
- Open-source alternatives

The architecture allows new embedding models to be added without changing retrieval logic.

Each chunk may contain embeddings generated from multiple embedding models simultaneously.

---

# Stage 5: Vector Database Layer

## Pinecone Integration

The system stores embeddings inside Pinecone vector databases.

### Index Management

Indexes are automatically created based on embedding model type.

Features:

- Dynamic index creation
- Automatic dimension detection
- Cosine similarity search
- Serverless deployment

Each vector contains metadata such as:

```json
{
  "text": "...",
  "title": "...",
  "source_url": "...",
  "document_id": "..."
}
```

This metadata is later used during retrieval.

---

# Stage 6: Retrieval Layer

The retrieval layer converts user questions into vector embeddings and performs semantic similarity search.

Workflow:

```text
User Question
      │
      ▼
Embedding Generation
      │
      ▼
Pinecone Similarity Search
      │
      ▼
Top-K Context Chunks
```

The Retriever component supports:

- User-tier-specific retrieval
- Multiple embedding models
- Adjustable Top-K retrieval

Example:

```python
retriever.query(
    question,
    k=5,
    user_tier="premium"
)
```

This architecture enables future premium/free product tiers.

---

# Stage 7: LLM Generation Layer

The generation layer combines retrieval with OpenAI models.

Supported models:

### Free Tier

- GPT-4o-mini

### Premium Tier

- GPT-4o

Workflow:

```text
User Question
      │
      ▼
Retrieve Relevant Chunks
      │
      ▼
Build Context Prompt
      │
      ▼
Send to LLM
      │
      ▼
Generate Response
```

Example prompt structure:

```text
User Question:
<question>

Context:
<retrieved chunks>
```

This ensures generated answers remain grounded in retrieved knowledge rather than relying solely on model memory.

---

# Storage Architecture

The platform stores information at multiple stages:

```text
Raw Documents
      │
Processed Documents
      │
Chunk Documents
      │
Embeddings
      │
Vector Database
```

This layered storage design provides:

- Reprocessing capability
- Debugging visibility
- Auditability
- Version control opportunities

---

# Engineering Challenges Solved

## 1. Hallucination Reduction

Implemented Retrieval-Augmented Generation to force responses to be grounded in retrieved knowledge sources.

---

## 2. Multi-Format Document Processing

Designed a routing architecture capable of supporting multiple content types:

- HTML
- PDF

with future extensibility for additional formats.

---

## 3. Semantic Search Quality

Implemented semantic chunking and vector similarity retrieval to improve relevance compared to keyword-only search systems.

---

## 4. Embedding Abstraction

Created a provider-independent embedding architecture supporting OpenAI and HuggingFace models through a common interface.

---

## 5. Scalable Vector Storage

Integrated Pinecone serverless vector databases with automatic index provisioning and metadata management.

---

## 6. Modular Service-Oriented Design

Separated the system into independent modules:

- Ingestion
- Extraction
- Chunking
- Embeddings
- Vector Storage
- Retrieval
- Generation

allowing individual components to evolve independently.

---

# Relevant Experience Demonstrated

This project demonstrates practical experience in:

- Retrieval-Augmented Generation (RAG)
- Large Language Models (LLMs)
- AI system architecture
- Semantic search systems
- Vector databases
- Pinecone
- OpenAI APIs
- HuggingFace models
- FastAPI backend development
- Document intelligence pipelines
- PDF processing
- Web content extraction
- Metadata extraction
- Semantic chunking
- Embedding generation
- Information retrieval
- Prompt engineering
- Scalable backend architecture
- Service-oriented system design

---

# Interview Summary

HatchBot is a production-style Retrieval-Augmented Generation platform that I built to provide accurate, knowledge-grounded AI responses. The system supports ingestion of PDFs and webpages, uses Trafilatura and PyMuPDF for content extraction, LangChain SemanticChunker for semantic segmentation, OpenAI and HuggingFace embeddings for vector generation, Pinecone for vector storage, and GPT-4o-based models for response generation. I designed the architecture as a modular pipeline consisting of ingestion, preprocessing, chunking, embeddings, retrieval, and generation services, enabling scalable knowledge processing while reducing hallucinations through retrieval-based grounding.
