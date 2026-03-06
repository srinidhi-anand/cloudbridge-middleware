# CloudBridge Middleware — Architecture

## Overview

CloudBridge Middleware is a monorepo-based file upload and chunking system. Files are uploaded via an API Gateway, split into chunks, stored locally by a dedicated storage service, and tracked with metadata in PostgreSQL. All inter-service communication is handled via gRPC.

---

## 1. Monorepo Structure

```
cloudbridge-middleware/
├── apps/
│   ├── api-gateway/          # Node.js upload gateway
│   └── web-ui/               # Minimal frontend
├── services/
│   ├── metadata-service/     # .NET — file & chunk metadata (PostgreSQL)
│   └── chunk-storage-service/ # .NET — chunk persistence to disk
├── packages/
│   └── proto-definitions/    # Shared gRPC contracts (.proto files)
├── infra/
│   └── docker/
│       └── docker-compose.yml
└── docs/
```

**Tooling:**

| Tool            | Purpose                      |
| --------------- | ---------------------------- |
| pnpm workspaces | Monorepo package management  |
| Node.js         | API Gateway & Web UI runtime |
| .NET            | Backend microservices        |
| Docker          | Local dev orchestration      |

---

## 2. gRPC Contracts

Shared protobuf definitions live in `packages/proto-definitions` and are consumed by all services.

```
packages/proto-definitions/
└── proto/
    ├── metadata.proto
    └── storage.proto
```

### Service Definitions

```protobuf
// metadata.proto
service MetadataService {
  rpc RegisterFile(FileMetadata) returns (MetadataResponse);
}

// storage.proto
service ChunkStorageService {
  rpc StoreChunk(ChunkRequest) returns (ChunkResponse);
}
```

---

## 3. API Gateway

**Location:** `apps/api-gateway`  
**Runtime:** Node.js (Express or Fastify)

### Responsibilities

- Expose HTTP upload endpoint
- Split incoming files into chunks
- Forward chunks to Chunk Storage Service via gRPC
- Forward file metadata to Metadata Service via gRPC

### Upload Endpoint

```
POST /upload
```

### Request Flow

```
Client uploads file
        ↓
  API Gateway receives file
        ↓
  Split file into chunks
        ↓
  [gRPC] Send each chunk → ChunkStorageService
        ↓
  [gRPC] Send file metadata + chunk map → MetadataService
        ↓
  Return success response to client
```

---

## 4. Metadata Service

**Location:** `services/metadata-service`  
**Runtime:** .NET  
**Database:** PostgreSQL

### Responsibilities

- Persist file-level metadata
- Persist chunk index and location mappings

### Database Schema

```sql
-- Files table
Files
-----
id          UUID  PRIMARY KEY
filename    TEXT  NOT NULL
size        BIGINT

-- Chunks table
Chunks
------
chunk_id     UUID  PRIMARY KEY
file_id      UUID  REFERENCES Files(id)
chunk_index  INT   NOT NULL
location     TEXT  NOT NULL
```

---

## 5. Chunk Storage Service

**Location:** `services/chunk-storage-service`  
**Runtime:** .NET

### Responsibilities

- Receive chunk payloads via gRPC
- Persist chunks to local disk

### Storage Layout

```
/data/chunks/
├── chunk_001
├── chunk_002
└── chunk_003
```

> No cloud storage integration in Week 1. All chunks are written to the local filesystem.

---

## 6. Web UI

**Location:** `apps/web-ui`  
**Runtime:** Node.js

### Responsibilities

- Provide a minimal browser interface for file uploads
- Call `POST /upload` on the API Gateway

### UI Components

```
┌────────────────────────────┐
│  [ Choose File ]  [Upload] │
│                            │
│  Progress: ████████░░ 80%  │
└────────────────────────────┘
```

---

## 7. Docker Compose

**Location:** `infra/docker/docker-compose.yml`

All services run locally via Docker Compose for Week 1 development.

```yaml
services:
  api-gateway:
  metadata-service:
  chunk-storage-service:
  postgres:
  web-ui:
```

### Service Dependency Graph

```
web-ui
  └── api-gateway
        ├── chunk-storage-service
        │     └── (local disk)
        └── metadata-service
              └── postgres
```

---

## 8. Communication Architecture

```
┌─────────┐   HTTP POST /upload   ┌─────────────┐
│  Web UI │ ───────────────────→  │ API Gateway │
└─────────┘                       └──────┬──────┘
                                         │
                    ┌────────────────────┤
                    │ gRPC               │ gRPC
                    ↓                    ↓
          ┌──────────────────┐  ┌─────────────────────┐
          │ Chunk Storage    │  │  Metadata Service   │
          │ Service (.NET)   │  │  (.NET)             │
          └────────┬─────────┘  └──────────┬──────────┘
                   │                        │
             /data/chunks/            PostgreSQL
```

---

## 9. Week 1 Success Criteria

| #   | Goal                 | Description                                        |
| --- | -------------------- | -------------------------------------------------- |
| ✅  | File upload          | Client can upload a file via the Web UI            |
| ✅  | Chunking             | API Gateway splits the file into chunks            |
| ✅  | Chunk storage        | Chunks are persisted to local disk                 |
| ✅  | Metadata saved       | File and chunk records written to PostgreSQL       |
| ✅  | gRPC communication   | Services communicate via defined proto contracts   |
| ✅  | Docker orchestration | All services start and run via `docker-compose up` |
