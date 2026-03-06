# CloudBridge Middleware

CloudBridge Middleware is a **multi-cloud storage abstraction layer** designed to unify storage across major cloud providers such as **AWS S3, Google Cloud Storage, and Azure Blob Storage**.

The system provides a **high-performance chunk-based storage engine**, **metadata management**, and a **unified API gateway**, enabling applications to interact with multiple cloud providers through a single interface.

This project demonstrates **distributed systems architecture**, **microservices communication using gRPC**, and **multi-cloud storage orchestration**.

---

# Project Goals

CloudBridge Middleware aims to solve the following challenges:

• Avoid vendor lock-in across cloud storage providers  
• Improve scalability for large file storage  
• Enable efficient file chunking and replication  
• Provide a unified API for applications  
• Maintain metadata consistency across distributed storage

---

# Tech Stack

## Frontend

- Next.js
- TypeScript
- TailwindCSS

## API Layer

- Node.js
- TypeScript
- Express / Fastify
- gRPC Client

## Core Storage Engine

- C# (.NET)
- gRPC Server
- Chunking Engine
- Integrity Checker

## Metadata Service

- C# (.NET)
- PostgreSQL
- gRPC API

## Infrastructure

- Docker
- PNPM Monorepo
- Multi-Cloud SDKs

Supported cloud providers:

- AWS S3
- Google Cloud Storage
- Azure Blob Storage

---

# System Architecture

The system follows a **microservice architecture** with clear separation between:

- API Layer
- Metadata Service
- Storage Engine
- Cloud Providers

The middleware acts as a **bridge between applications and multiple cloud storage systems**.

---

# Architecture Diagram

![CloudBridge Architecture](./architecture-HLD_LLD.png)

The diagram shows both:

- **High Level Architecture**
- **Low Level Architecture**

---

# High Level Architecture

### User Layer

Users interact with the system via the **Next.js frontend**.

### API Gateway (Node.js)

The gateway provides:

- REST APIs
- gRPC clients
- Authentication
- Request routing

It acts as the **single entry point** to the system.

### Metadata Service (.NET)

Responsible for:

- File metadata storage
- Chunk mapping
- Replication information
- Metadata queries

Uses **PostgreSQL** as the metadata database.

### Chunk Storage Service

Handles:

- File chunking
- Chunk distribution
- Integrity verification
- Storage adapter logic

### Multi-Cloud Storage

Actual data is stored across multiple providers:

- AWS S3
- Google Cloud Storage
- Azure Blob Storage

---

# Low Level Architecture

### API Gateway

Responsibilities:

- REST API endpoints
- gRPC communication with services
- Authentication and authorization
- File upload orchestration
- Chunk management

Components:

- REST API
- gRPC Client
- Chunking Engine
- Auth Module

---

### Metadata Service (.NET)

Manages metadata and replication logic.

Components:

- gRPC API Handlers
- Metadata Database (PostgreSQL)
- File Metadata Manager
- Replication Manager

---

### Chunk Storage Service

Handles physical chunk operations.

Components:

- gRPC Chunk Handlers
- Storage Adapters
- Integrity Checker

---

### Replication Controller

Coordinates chunk replication across cloud providers to ensure:

- Data redundancy
- High availability
- Fault tolerance

---

# Key Features

### Multi-Cloud Storage

Store files across multiple providers.

### Chunk Based Storage

Files are split into chunks for:

- faster uploads
- parallel downloads
- distributed storage

### Metadata Management

Tracks:

- file locations
- chunk mapping
- replication state

### gRPC Microservices

Services communicate using **high performance gRPC calls**.

### Replication System

Ensures data is duplicated across providers.

---

# Example Workflow

### File Upload

1. User uploads file through frontend
2. API Gateway receives request
3. File is split into chunks
4. Metadata Service records chunk mapping
5. Chunk Storage Service stores chunks in cloud providers
6. Replication Controller ensures redundancy

---

### File Download

1. Client requests file
2. Metadata Service returns chunk locations
3. Chunks are fetched from cloud providers
4. Chunks are reassembled
5. File returned to client

---

# Deployment

The system is containerized using **Docker**.

Services run independently and communicate via **gRPC**.

Example deployment stack:

- Docker
- Docker Compose
- Kubernetes (future)

---

# Future Improvements

- Kubernetes orchestration
- Smart storage routing
- Edge caching
- Encryption at rest
- CDN integration
- AI-based storage optimization

---

# Learning Outcomes

This project demonstrates knowledge in:

- Distributed Systems
- Microservices Architecture
- gRPC Communication
- Multi-Cloud Storage Design
- Backend Systems Engineering
- DevOps and Containerization

---

# Author

CloudBridge Middleware is developed as a **distributed systems and cloud architecture project** demonstrating scalable multi-cloud storage middleware design.

---
