package handlers

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"time"
)

func CreateRoomHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	userID, err := GetUserIDFromCookie(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Unauthorized, login first"})
		return
	}

	rand.Seed(time.Now().UnixNano())
	roomCode := fmt.Sprintf("%06d", rand.Intn(1000000)) // 6 digit code

	_, err = DB.Exec("INSERT INTO rooms (room_code, creator_id) VALUES ($1, $2)", roomCode, userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Room creation failed"})
		return
	}

	_, err = DB.Exec("INSERT INTO room_members (room_id, user_id) VALUES ((SELECT id FROM rooms WHERE room_code=$1), $2)", roomCode, userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to add creator as member"})
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"room_code": roomCode})
}

func JoinRoomHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	userID, err := GetUserIDFromCookie(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Unauthorized, login first"})
		return
	}

	var data struct {
		RoomCode string `json:"room_code"`
	}
	err = json.NewDecoder(r.Body).Decode(&data)
	if err != nil || data.RoomCode == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid or missing room code"})
		return
	}

	var roomID int
	err = DB.QueryRow("SELECT id FROM rooms WHERE room_code=$1", data.RoomCode).Scan(&roomID)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Room not found"})
		return
	}

	var count int
	err = DB.QueryRow("SELECT COUNT(*) FROM room_members WHERE room_id=$1 AND user_id=$2", roomID, userID).Scan(&count)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Database error"})
		return
	}

	if count > 0 {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "Already in room"})
		return
	}

	_, err = DB.Exec("INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)", roomID, userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to join room"})
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"message": "Joined room"})
}

func LeaveRoomHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	userID, err := GetUserIDFromCookie(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Unauthorized, login first"})
		return
	}

	var data struct {
		RoomCode string `json:"room_code"`
	}
	err = json.NewDecoder(r.Body).Decode(&data)
	if err != nil || data.RoomCode == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid or missing room code"})
		return
	}

	var roomID, creatorID int
	err = DB.QueryRow("SELECT id, creator_id FROM rooms WHERE room_code=$1", data.RoomCode).Scan(&roomID, &creatorID)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Room not found"})
		return
	}

	var count int
	err = DB.QueryRow("SELECT COUNT(*) FROM room_members WHERE room_id=$1 AND user_id=$2", roomID, userID).Scan(&count)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Database error"})
		return
	}

	if count == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "You are not a member of this room"})
		return
	}

	if creatorID == userID {
		// Delete room and members
		_, err = DB.Exec("DELETE FROM room_members WHERE room_id=$1", roomID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to delete room members"})
			return
		}

		_, err = DB.Exec("DELETE FROM rooms WHERE id=$1", roomID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to delete room"})
			return
		}

		err = os.RemoveAll("uploads/" + data.RoomCode)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to delete upload folder"})
			return
		}

		json.NewEncoder(w).Encode(map[string]string{"message": "Room deleted by creator"})
	} else {
		// Leave room only
		_, err = DB.Exec("DELETE FROM room_members WHERE room_id=$1 AND user_id=$2", roomID, userID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to leave room"})
			return
		}

		json.NewEncoder(w).Encode(map[string]string{"message": "Left room"})
	}
}
