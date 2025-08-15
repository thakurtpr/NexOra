package main

import (
	"log"
	"os"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2/middleware/cors" // <-- 1. Import the CORS middleware
)

// (Hub struct and newHub function are the same as before)
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

    // --- THIS IS THE CRITICAL ADDITION ---
    // 2. Add and configure the CORS middleware
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*", // Allows all origins
		AllowHeaders: "Origin, Content-Type, Accept",
	}))

	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})

	app.Get("/ws/:roomID", websocket.New(func(c *websocket.Conn) {
		// (The rest of the code is exactly the same as before)
		roomID := c.Params("roomID")
		hub.mu.Lock()
		if _, ok := hub.rooms[roomID]; !ok {
			hub.rooms[roomID] = make(map[*websocket.Conn]bool)
		}
		hub.rooms[roomID][c] = true
		log.Printf("Client connected to room '%s'. Total clients in room: %d", roomID, len(hub.rooms[roomID]))
		hub.mu.Unlock()
		
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

		for {
			_, msg, err := c.ReadMessage()
			if err != nil {
				log.Printf("Error reading message from client in room '%s': %v", roomID, err)
				break
			}
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

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
    log.Printf("Starting server on port %s", port)
	log.Fatal(app.Listen(":" + port))
}