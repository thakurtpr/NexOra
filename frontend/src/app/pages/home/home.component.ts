import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  roomId = '';

  constructor(private router: Router) {}

  joinRoom(): void {
    if (this.roomId.trim()) {
      this.router.navigate(['/room', this.roomId.trim()]);
    } else {
      alert('Please enter a room name.');
    }
  }
}