// ** VERIFIED FINAL main.go **

package main

import (
	"log"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/contrib/websocket"
)

// Hub maintains the set of active clients and broadcasts messages.
type Hub struct {
	rooms map[string]map[*websocket.Conn]bool
	mu    sync.Mutex
}

func newHub() *Hub {
	return &Hub{
		rooms: make(map[string]map[*websocket.Conn]bool),
	}
}

func main() {
	hub := newHub()
	app := fiber.New()

	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})

	app.Get("/ws/:roomID", websocket.New(func(c *websocket.Conn) {
		roomID := c.Params("roomID")
		
		// --- Client Registration ---
		hub.mu.Lock()
		if _, ok := hub.rooms[roomID]; !ok {
			hub.rooms[roomID] = make(map[*websocket.Conn]bool)
		}
		hub.rooms[roomID][c] = true
		log.Printf("Client connected to room '%s'. Total clients in room: %d", roomID, len(hub.rooms[roomID]))
		hub.mu.Unlock()

		// --- Defer Client Unregistration ---
		defer func() {
			hub.mu.Lock()
			delete(hub.rooms[roomID], c)
			log.Printf("Client disconnected from room '%s'. Total clients in room: %d", roomID, len(hub.rooms[roomID]))
			if len(hub.rooms[roomID]) == 0 {
				delete(hub.rooms, roomID)
				log.Printf("Room '%s' is empty, closing room.", roomID)
			}
			hub.mu.Unlock()
			c.Close()
		}()

		// --- Message Loop ---
		for {
			_, msg, err := c.ReadMessage()
			if err != nil {
				// This log is important to see why a client disconnects.
				log.Printf("Error reading message from client in room '%s': %v", roomID, err)
				break
			}

			// --- Broadcast Logic ---
			hub.mu.Lock()
			for client := range hub.rooms[roomID] {
				if client != c {
					if err := client.WriteMessage(websocket.TextMessage, msg); err != nil {
						log.Printf("Error writing message to client in room '%s': %v", roomID, err)
					}
				}
			}
			hub.mu.Unlock()
		}
	}))

	log.Println("Starting server on port 3000")
	log.Fatal(app.Listen(":3000"))
}