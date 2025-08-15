import { Component, OnDestroy, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WebrtcService } from '../../webrtc.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

export interface ChatMessage {
  text: string;
  sender: 'me' | 'peer';
}

interface ReceivedFile {
  name: string;
  url: SafeUrl;
}

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.css'] // Plural: styleUrls
})
export class RoomComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageContainer') private messageContainer!: ElementRef;
  @ViewChild('fileInput') private fileInput!: ElementRef;

  public roomId = '';
  public connectionStatus = 'Initializing...';
  public isConnected = false;
  
  public messageToSend = '';
  public chatMessages: ChatMessage[] = []; 
  public receivedFiles: ReceivedFile[] = [];
  
  private subscriptions = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private webrtcService: WebrtcService
  ) {}

  ngOnInit(): void {
    const routeSub = this.route.params.subscribe(params => {
        this.roomId = params['roomId'];
        if (this.roomId) {
          this.webrtcService.connect(this.roomId);
        }
    });

    const messageSub = this.webrtcService.receivedMessage$.subscribe(msgObj => {
      this.chatMessages.push({ text: msgObj.text, sender: 'peer' });
    });
    
    const statusSub = this.webrtcService.connectionState$.subscribe(status => {
        this.connectionStatus = status;
        this.isConnected = status === 'Data Channel Open!';
    });

    const fileSub = this.webrtcService.receivedFile$.subscribe(file => {
      const url = this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(file.blob));
      this.receivedFiles.push({ name: file.name, url: url });
    });
    
    this.subscriptions.add(routeSub);
    this.subscriptions.add(messageSub);
    this.subscriptions.add(statusSub);
    this.subscriptions.add(fileSub);
  }

  ngAfterViewChecked(): void { this.scrollToBottom(); }
  
  startCall(): void { this.webrtcService.startCall(); }

  sendMessage(): void {
    if (!this.messageToSend.trim()) return;
    const message: ChatMessage = {
      text: this.messageToSend,
      sender: 'me'
    };
    this.chatMessages.push(message);
    this.webrtcService.sendMessage({ text: this.messageToSend });
    this.messageToSend = '';
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.webrtcService.sendFile(input.files[0]);
      this.fileInput.nativeElement.value = ''; // Reset file input
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private scrollToBottom(): void {
    try {
      this.messageContainer.nativeElement.scrollTop = this.messageContainer.nativeElement.scrollHeight;
    } catch(err) { /* ignore error */ }
  }
}