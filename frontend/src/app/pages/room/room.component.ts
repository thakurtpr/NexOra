import { Component, OnDestroy, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WebrtcService } from '../../webrtc.service'; // Adjust path if needed
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

export interface ChatMessage {
  type: 'text' | 'file';
  sender: 'me' | 'peer';
  text?: string;
  fileInfo?: {
    name: string;
    size: number;
    url?: SafeUrl;
  };
}

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.css']
})
export class RoomComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageContainer') private messageContainer!: ElementRef;
  @ViewChild('fileInput') private fileInput!: ElementRef;

  public roomId = '';
  public connectionStatus = 'Initializing...';
  public isConnected = false;
  public messageToSend = '';
  public chatMessages: ChatMessage[] = [];
  public selectedFile: File | null = null;
  private subscriptions = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private webrtcService: WebrtcService
  ) {}

  ngOnInit(): void {
    const routeSub = this.route.params.subscribe(params => {
        this.roomId = params['roomId'];
        if (this.roomId) { this.webrtcService.connect(this.roomId); }
    });

    const messageSub = this.webrtcService.receivedMessage$.subscribe(msgObj => {
      this.chatMessages.push({ type: 'text', sender: 'peer', text: msgObj.text });
    });

    // --- THIS IS THE CORRECTED SECTION ---
    const statusSub = this.webrtcService.connectionState$.subscribe(status => {
        this.connectionStatus = status;

        // Check for any status that confirms a successful peer connection.
        const isNowConnected = status === 'Data Channel Open!' || status === 'Connected to Peer!' || status === 'Peer state: connected';
        this.isConnected = isNowConnected;

        // Ensure we reset the state if the connection is lost.
        if (status.includes('Disconnected') || status.includes('Failed')) {
          this.isConnected = false;
        }
    });

    const fileSub = this.webrtcService.receivedFile$.subscribe(file => {
      this.chatMessages.push({
        type: 'file', sender: 'peer',
        fileInfo: {
          name: file.name, size: file.blob.size,
          url: this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(file.blob))
        }
      });
    });

    this.subscriptions.add(routeSub);
    this.subscriptions.add(messageSub);
    this.subscriptions.add(statusSub);
    this.subscriptions.add(fileSub);
  }

  ngAfterViewChecked(): void { this.scrollToBottom(); }

  startCall(): void { this.webrtcService.startCall(); }

  send(): void {
    if (this.selectedFile) {
      this.webrtcService.sendFile(this.selectedFile);
      this.chatMessages.push({
        type: 'file', sender: 'me',
        fileInfo: { name: this.selectedFile.name, size: this.selectedFile.size }
      });
      this.cancelFileSelection();
    }
    if (this.messageToSend.trim()) {
      this.chatMessages.push({ type: 'text', sender: 'me', text: this.messageToSend });
      this.webrtcService.sendMessage({ text: this.messageToSend });
      this.messageToSend = '';
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) { this.selectedFile = input.files[0]; }
  }
  
  cancelFileSelection(): void {
    this.selectedFile = null;
    this.fileInput.nativeElement.value = '';
  }

  ngOnDestroy(): void {
    // This now cleans up both the component's subscriptions AND the service's connections.
    this.subscriptions.unsubscribe();
    this.webrtcService.leaveRoom();
  }

  private scrollToBottom(): void {
    try {
      this.messageContainer.nativeElement.scrollTop = this.messageContainer.nativeElement.scrollHeight;
    } catch(err) { /* ignore */ }
  }
}