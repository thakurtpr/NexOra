package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func InitDB() {
	var err error
	DB, err = sql.Open("postgres", "user=postgres password=aditya dbname=room_app sslmode=disable")
	if err != nil {
		log.Fatal("Database open failed:", err)
	}

	if err := DB.Ping(); err != nil {
		log.Fatal("Cannot connect to DB:", err)
	}
	fmt.Println("✅ Connected to PostgreSQL database")
}

func GetUserIDFromCookie(r *http.Request) (int, error) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		return 0, err
	}
	var id int
	fmt.Sscanf(cookie.Value, "%d", &id)
	return id, nil
}

func IsUserInRoom(userID int, roomCode string) bool {
	var count int
	err := DB.QueryRow(`
		SELECT COUNT(*) FROM room_members 
		WHERE user_id = $1 AND room_id = (SELECT id FROM rooms WHERE room_code = $2)
	`, userID, roomCode).Scan(&count)
	if err != nil {
		fmt.Println("Error checking user in room:", err)
		return false
	}
	return count > 0
}
