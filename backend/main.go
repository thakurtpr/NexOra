package main

import (
	"log"
	"net/http"
	"roomapp/backend/handlers" // Adjust import path as per your module setup
)

func main() {
	// Initialize DB
	handlers.InitDB()
	defer handlers.DB.Close()

	// HTTP routes
	http.HandleFunc("/signup", handlers.SignupHandler)
	http.HandleFunc("/login", handlers.LoginHandler)

	http.HandleFunc("/create-room", handlers.CreateRoomHandler)
	http.HandleFunc("/join-room", handlers.JoinRoomHandler)
	http.HandleFunc("/leave-room", handlers.LeaveRoomHandler)

	http.HandleFunc("/ws", handlers.WSHandler)

	// Serve frontend static files (adjust "../frontend" path as needed)
	http.Handle("/", http.FileServer(http.Dir("../frontend")))

	log.Println("Server running on :8080")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal("ListenAndServe:", err)
	}
}
