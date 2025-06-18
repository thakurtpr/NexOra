package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

type SignalMessage struct {
	RoomCode  string          `json:"room_code,omitempty"`
	SDP       json.RawMessage `json:"sdp,omitempty"`
	Candidate json.RawMessage `json:"candidate,omitempty"`
}

type Room struct {
	clients []*websocket.Conn
}

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	rooms   = make(map[string]*Room)
	roomsMu sync.Mutex
)

// WebSocket handler for signaling
func WSHandler(w http.ResponseWriter, r *http.Request) {
	// Optional: user session validation
	_, err := GetUserIDFromCookie(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Println("Upgrade error:", err)
		return
	}

	defer conn.Close()

	var initMsg SignalMessage
	_, msg, err := conn.ReadMessage()
	if err != nil {
		fmt.Println("Initial read error:", err)
		return
	}

	err = json.Unmarshal(msg, &initMsg)
	if err != nil || initMsg.RoomCode == "" {
		conn.WriteJSON(map[string]string{"type": "error", "message": "Invalid or missing room_code"})
		return
	}

	roomID := initMsg.RoomCode

	added := addClientToRoom(conn, roomID)
	if !added {
		conn.WriteJSON(map[string]string{"type": "error", "message": "Room full"})
		return
	}

	fmt.Println("[Room", roomID, "] New WebSocket client connected")

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			fmt.Printf("Read error from %v: %v\n", conn.RemoteAddr(), err)
			break
		}

		// Relay to the other peer
		relayMessageToPeers(conn, roomID, msg)
	}

	removeClientFromRoom(conn, roomID)
}

func addClientToRoom(conn *websocket.Conn, roomID string) bool {
	roomsMu.Lock()
	defer roomsMu.Unlock()

	room, exists := rooms[roomID]
	if !exists {
		room = &Room{clients: []*websocket.Conn{}}
		rooms[roomID] = room
	}

	if len(room.clients) >= 2 {
		return false
	}

	room.clients = append(room.clients, conn)
	return true
}

func removeClientFromRoom(conn *websocket.Conn, roomID string) {
	roomsMu.Lock()
	defer roomsMu.Unlock()

	room, exists := rooms[roomID]
	if !exists {
		return
	}

	// Remove this conn
	newClients := []*websocket.Conn{}
	for _, c := range room.clients {
		if c != conn {
			newClients = append(newClients, c)
		}
	}
	room.clients = newClients

	fmt.Printf("[Room %s] Client disconnected, remaining: %d\n", roomID, len(room.clients))

	if len(room.clients) == 0 {
		delete(rooms, roomID)
	}
}

func relayMessageToPeers(sender *websocket.Conn, roomID string, msg []byte) {
	roomsMu.Lock()
	defer roomsMu.Unlock()

	room, exists := rooms[roomID]
	if !exists {
		return
	}

	for _, c := range room.clients {
		if c != sender {
			err := c.WriteMessage(websocket.TextMessage, msg)
			if err != nil {
				fmt.Println("Relay error:", err)
			}
		}
	}
}
