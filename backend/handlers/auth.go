package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
)

func SignupHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	var data struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	var exists bool
	err := DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE username=$1)", data.Username).Scan(&exists)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Database error"})
		return
	}
	if exists {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "User already exists, please login"})
		return
	}

	_, err = DB.Exec("INSERT INTO users (username, password) VALUES ($1, $2)", data.Username, data.Password)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Signup failed"})
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"message": "Signup successful"})
}

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	var data struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	var userID int
	var storedPassword string
	err := DB.QueryRow("SELECT id, password FROM users WHERE username=$1", data.Username).Scan(&userID, &storedPassword)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "User not found. Please sign up first."})
		return
	}

	if storedPassword != data.Password {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid password"})
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:  "session_id",
		Value: fmt.Sprint(userID),
		Path:  "/",
	})

	json.NewEncoder(w).Encode(map[string]string{"message": "Login successful"})
}
