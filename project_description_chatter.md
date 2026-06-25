# Chatter App — Detailed Project Description

Chatter App is a full-stack, real-time messaging web application inspired by WeChat, designed with a cat-themed user interface. The project focuses on secure user authentication, real-time chat communication, friend request workflows, persistent message storage, profile avatar management, and client-side caching for improved user experience.

## High-Level Architecture

The application follows a separated frontend/backend architecture:

- **Frontend:** React + Vite single-page application
- **Backend:** Node.js + Express REST API server
- **Real-time Layer:** Socket.IO for live messaging and friend request notifications
- **Database:** PostgreSQL managed through Prisma ORM
- **File Storage:** AWS S3 using pre-signed URLs for avatar uploads and retrieval
- **Client-side Storage:** IndexedDB and LocalStorage for caching profile images and user-related data
- **Authentication:** bcrypt password hashing and HTTP-only cookie-based sessions

The frontend communicates with the backend through RESTful API endpoints for authentication, users, friends, conversations, avatars, and chat history. Real-time events such as incoming messages and accepted friend requests are handled through Socket.IO.

---

## Technologies Used

### Frontend

- React
- Vite
- JavaScript
- HTML/CSS
- React Router
- Socket.IO Client
- IndexedDB through the `idb` library
- LocalStorage

### Backend

- Node.js
- Express.js
- Socket.IO
- Prisma ORM
- PostgreSQL
- bcrypt
- cookie-parser
- CORS
- AWS SDK for S3

### Cloud / Infrastructure

- AWS S3
- Pre-signed upload and download URLs
- Environment-variable-based configuration
- Production-ready static frontend serving through Express

---

## Backend Architecture

The backend is organized into a layered structure:

- **Routers:** Define API routes for different domains such as authentication, users, friends, avatars, conversations, and chat messages.
- **Controllers:** Handle HTTP requests, validate input, check authentication, and coordinate service logic.
- **Services:** Contain reusable business logic for database operations, sessions, users, friends, conversations, messages, and S3 access.
- **Database Layer:** Prisma ORM maps JavaScript logic to PostgreSQL tables.

This structure separates concerns and makes the backend easier to maintain, test, and extend.

Example backend modules include:

- `auth.controller.js`
- `auth.service.js`
- `session.service.js`
- `friend.service.js`
- `conversation.service.js`
- `chatMessage.service.js`
- `avatar.service.js`
- `presignUrl.js`
- `s3client.js`

---

## Database Design

The application uses PostgreSQL with Prisma ORM. The main models include:

### User

Stores account information such as email, username, hashed password, user ID, sessions, avatar, friends, conversations, and sent/received messages.

### Session

Stores server-side login sessions with expiration timestamps. Sessions are linked to users and used with HTTP-only cookies.

### Avatar

Stores avatar metadata, including the S3 object key associated with each user.

### Friend

Represents friend relationships and friend request states. It supports pending and accepted relationships.

### UserSummary

Stores lightweight user-level metadata such as pending friend request indicators and friend ID lists.

### Conversations

Stores per-user conversation summaries, including friend information, last message, and last message timestamp.

### ChatMessages

Stores persistent chat messages, including sender, receiver, content, message type, and creation time.

---

## Authentication and Security

The project implements secure authentication using:

- `bcrypt` for password hashing
- HTTP-only cookies for session storage
- Server-side session validation
- Session expiration and renewal
- Protected API routes
- CORS configuration with credentials enabled

During registration, the backend creates the user, session, and user summary inside a Prisma transaction to keep account creation consistent. Passwords are hashed before storage, and login verifies the submitted password against the stored hash.

The frontend uses protected routes to prevent unauthenticated users from accessing the main application page.

---

## Real-Time Messaging System

The application uses Socket.IO to support real-time communication.

When a user connects, the frontend emits a `register` event with the user’s primary key. The backend stores a mapping between:

- `userPK -> socketId`
- `socketId -> userPK`

This allows the server to send real-time events directly to online users.

Supported real-time events include:

- Incoming friend request notifications
- Friend request accepted notifications
- Incoming chat messages

When a user sends a message, the backend saves it to PostgreSQL first, then emits a `receiveMessage` event to the recipient if they are online.

---

## Chat Message Flow

The chat system follows this flow:

1. User types a message in the React chat interface.
2. Frontend sends the message to the backend through a REST API.
3. Backend validates the session cookie.
4. Backend looks up the receiver by user ID.
5. Backend stores the message in PostgreSQL.
6. Backend emits a Socket.IO event to the receiver.
7. Receiver frontend updates the chat UI in real time.
8. Sender frontend updates local UI state after successful server response.

Messages are grouped by friend ID on the frontend. The app sorts messages by timestamp to preserve correct conversation order.

---

## Friend Request System

The project includes a complete friend request workflow:

- Search user by public user ID
- Send friend request
- Prevent sending requests to yourself
- Prevent duplicate friend requests
- Notify online users in real time
- Accept friend request
- Decline friend request
- Create conversation records for both users after acceptance

When a friend request is accepted, the backend creates two conversation records:

- One from the current user’s perspective
- One from the friend’s perspective

This makes conversation initialization simpler because each user has their own conversation summary row.

---

## Avatar Upload and AWS S3 Integration

The app uses AWS S3 for profile avatar storage.

Instead of uploading images through the backend directly, the backend generates pre-signed URLs:

- A **PUT pre-signed URL** for uploading a profile image
- A **GET pre-signed URL** for retrieving a profile image

This design reduces backend file-handling overhead and allows the browser to upload directly to S3 securely.

Avatar keys are stored using the user’s primary key, such as:

```text
avatars/{userPK}
```

This creates a predictable one-avatar-per-user storage pattern.

---

## Client-Side Caching

The frontend uses IndexedDB to cache images locally, including:

- Profile pictures
- Chat pictures
- Post pictures
- Profile picture creation timestamps

This reduces repeated network requests to S3 and improves page load speed. When the app starts, it checks whether the local cached avatar is still valid. If the server indicates the avatar has been updated, the frontend clears the old IndexedDB cache and fetches the latest image from S3.

---

## Frontend Architecture

The frontend is built with React and organized around authentication pages, protected user pages, chat components, friend management, and settings.

Major frontend areas include:

- Login and registration pages
- Protected route logic
- User dashboard
- Sidebar navigation
- Contact list
- Chat content panel
- Friend request page
- User settings and profile page
- Avatar handling
- Real-time Socket.IO event handlers

The chat UI keeps local state for:

- Current selected friend
- Friend list
- Incoming friend requests
- Chat messages grouped by friend ID
- Avatar URLs
- Message input
- User profile

React hooks such as `useState`, `useEffect`, and `useRef` are used to manage state and avoid stale closure issues in Socket.IO event callbacks.

---

## Important Technical Challenges Solved

### 1. Real-Time State Synchronization

The project handles real-time updates from Socket.IO while keeping React state consistent. It uses refs to avoid stale state problems when socket event handlers need access to the latest friend list or avatar URL.

### 2. Secure Session-Based Authentication

The app avoids storing authentication tokens in LocalStorage. Instead, it uses HTTP-only cookies and server-side session records to reduce exposure to client-side script access.

### 3. Persistent Messaging

Messages are stored in PostgreSQL so that chat history can be restored after refresh, logout, or reconnect.

### 4. Friend Relationship Modeling

The app models friend requests separately from conversations, allowing a clear workflow from pending request to accepted friendship to active conversation.

### 5. S3 Direct Upload Architecture

Using pre-signed URLs allows scalable file upload without routing large files through the Express server.

### 6. Client-Side Image Caching

IndexedDB caching reduces repeated avatar downloads and improves frontend performance.

---

## Relevant Experience Demonstrated

This project demonstrates practical full-stack software engineering experience, including:

- Building a React single-page application
- Designing RESTful APIs with Express
- Implementing real-time features with Socket.IO
- Managing relational data with PostgreSQL and Prisma
- Designing database schemas for users, sessions, friends, conversations, and messages
- Implementing secure authentication with bcrypt and HTTP-only cookies
- Integrating AWS S3 for scalable file storage
- Using pre-signed URLs for secure client-side uploads
- Managing frontend state with React hooks
- Handling asynchronous API calls and real-time events
- Structuring backend code with routers, controllers, and services
- Improving performance through IndexedDB caching
- Designing a maintainable full-stack application architecture

---

## Short Interview-Style Summary

Chatter App is a full-stack real-time messaging platform built with React, Node.js, Express, Socket.IO, PostgreSQL, Prisma, and AWS S3. I designed the application with a separated frontend/backend architecture, implemented secure authentication using bcrypt and HTTP-only cookie sessions, built RESTful APIs for users, friends, conversations, avatars, and chat messages, and used Socket.IO to support real-time messaging and friend request notifications. I also integrated AWS S3 with pre-signed URLs for scalable avatar upload and retrieval, and used IndexedDB on the frontend to cache profile images and reduce repeated network requests.

---

## Resume-Style Version

Designed and developed a full-stack, real-time chat application using React, Node.js, Express, Socket.IO, PostgreSQL, Prisma, and AWS S3. Implemented secure authentication with bcrypt and HTTP-only cookie-based sessions, built RESTful APIs for user management, friend requests, conversations, avatars, and chat messages, and designed a relational database schema for users, sessions, friendships, conversations, and persistent message history. Integrated Socket.IO for real-time messaging and friend request notifications, implemented AWS S3 pre-signed URLs for scalable avatar upload and retrieval, and used IndexedDB for client-side image caching to improve performance and reduce repeated network requests. Structured the backend into routers, controllers, and services to improve maintainability and extensibility.
