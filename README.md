# Nexus ⚡️ - Real-Time Chat & P2P File Transfer

![Nexus Demo GIF](./.github/assets/nexus-demo.gif)

**Nexus** is a modern, high-performance web application that enables real-time, peer-to-peer (P2P) communication directly in the browser. Using WebRTC, it allows users to create private rooms for secure text chat and lightning-fast direct file transfers, all without data passing through a central server.

---

## ✨ Features

*   **Secure Authentication:** User signup and login system to protect access.
*   **Private Rooms:** Create unique, private rooms or join existing ones with a simple Room ID.
*   **Real-Time Text Chat:** Instantaneous messaging between two peers in a room.
*   **P2P File Transfer:** Send files of any size directly to the other user. Data is transferred peer-to-peer, ensuring privacy and incredible speed.
*   **Multi-File Queue:** Select and queue multiple files for transfer. They will be sent sequentially.
*   **Transfer Progress & Control:** See real-time progress for file transfers and cancel them at any time.
*   **Responsive UI:** A clean, modern, and responsive user interface that works beautifully on all screen sizes.
*   **Connection Status:** Clear indicators for WebSocket and WebRTC connection states (connecting, connected, disconnected).
*   **Theming:** Includes multiple CSS themes (Modern, Dark, Soft) for easy customization.

---

## 🛠️ Tech Stack

*   **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+)
    *   **Real-Time Communication:** WebRTC (`RTCPeerConnection`, `RTCDataChannel`)
    *   **Signaling:** WebSockets
*   **Backend (Signaling Server):** Go (Golang)
    *   **Web Framework:** Standard `net/http` library
    *   **WebSocket Library:** `gorilla/websocket`
*   **STUN Server:** Google's public STUN servers for NAT traversal.

---

## 🚀 Getting Started

Follow these instructions to get a local copy of Nexus up and running on your machine for development and testing.

### Prerequisites

*   **Go:** Make sure you have Go (version 1.18 or newer) installed. [Download Go](https://golang.org/dl/)
*   **A Modern Web Browser:** Chrome, Firefox, Edge, or Safari.

### Installation & Setup

1.  **Clone the Repository**

    ```sh
    git clone https://github.com/your-username/nexus.git
    cd nexus
    ```

2.  **Run the Backend Signaling Server**

    The Go server handles user authentication and WebRTC signaling. Navigate to the backend directory and run the server:

    ```sh
    # Assuming your Go code is in a `backend` sub-directory
    cd backend
    go run main.go
    ```

    The server will start, typically on `localhost:8080`.

3.  **Launch the Frontend**

    The frontend is a static HTML file that can be opened directly in your browser. However, for security reasons (CORS), it's best served by a simple local server.

    *   **Using a Live Server Extension (Recommended for Dev):**
        If you use VS Code, the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension is perfect. Right-click on `index.html` and select "Open with Live Server".

    *   **Using Python's HTTP Server:**
        If you have Python installed, navigate to the frontend directory and run:
        ```sh
        # For Python 3
        python -m http.server
        ```
        Then open `http://localhost:8000` in your browser.

4.  **Connect Two Peers**

    *   Open two separate browser windows (or tabs).
    *   In the first window, sign up and create a new room. A Room ID will be displayed.
    *   In the second window, sign up (with a different username) and use the Room ID from the first window to join the room.
    *   You're connected! Start chatting and sending files.

---

## 🎨 Theming

Nexus comes with a few built-in themes. To change the theme, simply edit the `<link>` tag in `index.html`:

```html
<!-- In index.html -->
<!-- CHOOSE YOUR THEME: Change 'modern.css' to 'dark.css' or 'soft.css' -->
<link rel="stylesheet" href="dark.css">
