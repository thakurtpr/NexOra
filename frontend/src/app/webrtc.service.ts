import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { environment } from '../environments/environment'; // Use the main environment file

// --- Configuration ---
// STUN servers are needed to help devices discover each other's IP addresses
// when they are behind a NAT. This configuration uses free public servers from Google.
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};
const CHUNK_SIZE = 64 * 1024; // 64 KB chunks for file transfer

// --- Interfaces ---
interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'file-meta';
  data: any;
}

interface FileMetadata {
  name: string;
  size: number;
  type: string;
}

@Injectable({ providedIn: 'root' })
export class WebrtcService {
  // --- Private Properties ---
  private ws!: WebSocket;
  private peerConnection!: RTCPeerConnection;
  private dataChannel!: RTCDataChannel;

  // File transfer state
  private incomingFileInfo: FileMetadata | null = null;
  private receivedFileChunks: ArrayBuffer[] = [];
  private receivedBytes = 0;

  // --- Public Observables for Components ---
  // These subjects are long-lived and should NOT be replaced.
  public receivedMessage$ = new Subject<any>();
  public receivedFile$ = new Subject<{ name: string; type: string; blob: Blob }>();
  public connectionState$ = new Subject<string>();

  constructor(private zone: NgZone) {}

  // --- Public Methods ---

  /**
   * Connects to the signaling server via WebSocket.
   */
  public connect(roomId: string): void {
    if (!roomId) {
      console.error('Room ID is required to connect.');
      return;
    }

    this.connectionState$.next('Connecting...');

    // CORRECTED: Construct the URL from the environment file.
    const fullUrl = `${environment.wsUrl}/ws/${roomId}`;
    console.log(`[LOG] Attempting to connect to Signaling Server at: ${fullUrl}`);

    this.ws = new WebSocket(fullUrl);

    // Setup WebSocket event listeners
    this.ws.onopen = (event) => {
      console.log('[LOG] WebSocket connection opened successfully.', event);
      this.zone.run(() => this.connectionState$.next('Connected! Waiting for another user...'));
    };

    this.ws.onmessage = (event) => {
      console.log('[LOG] Received raw message from signaling server:', event.data);
      this.handleSignalingMessage(JSON.parse(event.data));
    };

    this.ws.onerror = (errorEvent) => {
      // This is a critical event to watch for connection failures.
      console.error('[ERROR] WebSocket connection error:', errorEvent);
      this.zone.run(() => this.connectionState$.next('Connection Failed!'));
    };

    this.ws.onclose = (event) => {
      // Log the reason for disconnection. Very useful for debugging.
      console.warn(`[WARN] WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`, event);
      this.zone.run(() => this.connectionState$.next('Disconnected from signaling server.'));
    };
  }

  /**
   * Initiates the WebRTC call by creating an offer.
   */
  public async startCall(): Promise<void> {
    console.log('[LOG] Starting call and creating WebRTC offer...');
    this.initializePeerConnection();

    // Create and configure the data channel for text and file sharing
    this.dataChannel = this.peerConnection.createDataChannel('dataChannel');
    this.setupDataChannelEvents();

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    console.log('[LOG] Offer created and set as local description. Sending to peer...');
    this.sendSignalingMessage('offer', offer);
  }

  /**
   * Sends a text message or a JSON object over the data channel.
   */
  public sendMessage(message: string | object): void {
    if (this.dataChannel?.readyState !== 'open') {
      console.warn('[WARN] Data channel is not open. Cannot send message.');
      return;
    }
    const dataToSend = typeof message === 'string' ? message : JSON.stringify(message);
    console.log('[LOG] Sending message via data channel:', dataToSend);
    this.dataChannel.send(dataToSend);
  }

  /**
   * Sends a file in chunks over the data channel.
   */
  public sendFile(file: File): void {
    if (this.dataChannel?.readyState !== 'open') {
      console.warn('[WARN] Data channel is not open. Cannot send file.');
      return;
    }
    console.log(`[LOG] Starting file transfer for: ${file.name} (${file.size} bytes)`);
    const metadata: FileMetadata = { name: file.name, size: file.size, type: file.type };

    // First, send the file metadata via the signaling server
    this.sendSignalingMessage('file-meta', metadata);

    // Then, start chunking and sending the file over the data channel
    let offset = 0;
    const reader = new FileReader();

    reader.onload = (e) => {
      if (!e.target?.result) return;
      const chunk = e.target.result as ArrayBuffer;
      this.dataChannel.send(chunk);
      offset += chunk.byteLength;

      if (offset < file.size) {
        readSlice(offset); // Read the next slice
      } else {
        console.log(`[LOG] Finished sending file: ${file.name}`);
      }
    };

    const readSlice = (o: number) => {
      const slice = file.slice(o, o + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };

    readSlice(0); // Start the process
  }

  /**
   * CORRECTED: Tears down all active connections cleanly.
   */
  public leaveRoom(): void {
    console.log('[LOG] Leaving room and cleaning up connections...');
    if (this.dataChannel) {
      this.dataChannel.close();
      console.log('[LOG] Data Channel closed.');
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      console.log('[LOG] PeerConnection closed.');
    }
    if (this.ws) {
      this.ws.close();
      // The ws.onclose event will handle the rest
    }
    // DO NOT create new Subjects here. This was the bug.
  }

  // --- Private Helper Methods ---

  private initializePeerConnection(): void {
    console.log('[LOG] Initializing RTCPeerConnection with ICE servers:', ICE_SERVERS);
    this.peerConnection = new RTCPeerConnection(ICE_SERVERS);

    // Listen for ICE candidates and send them to the other peer
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[LOG] New ICE candidate found. Sending to peer...');
        this.sendSignalingMessage('ice-candidate', event.candidate);
      }
    };

    // Listen for the remote peer's data channel
    this.peerConnection.ondatachannel = (event) => {
      console.log('[LOG] Received remote data channel.');
      this.dataChannel = event.channel;
      this.setupDataChannelEvents();
    };

    // Log connection state changes for debugging
    this.peerConnection.onconnectionstatechange = () => {
      this.zone.run(() => {
        const state = this.peerConnection.connectionState;
        console.log(`[LOG] PeerConnection state changed: ${state}`);
        this.connectionState$.next(`Peer state: ${state}`);
      });
    };
  }

  private setupDataChannelEvents(): void {
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      console.log('[LOG] Data channel is open!');
      this.zone.run(() => this.connectionState$.next('Connected to Peer!'));
    };

    this.dataChannel.onmessage = (event) => {
      this.zone.run(() => {
        if (typeof event.data === 'string') {
          console.log('[LOG] Received string message via data channel:', event.data);
          try {
            this.receivedMessage$.next(JSON.parse(event.data));
          } catch {
            this.receivedMessage$.next({ text: event.data, sender: 'peer' });
          }
        } else {
          // This is a file chunk
          this.handleFileChunk(event.data);
        }
      });
    };

    this.dataChannel.onclose = () => {
      console.log('[LOG] Data channel closed.');
      this.zone.run(() => this.connectionState$.next('Peer connection closed.'));
    };
  }

  private handleFileChunk(chunk: ArrayBuffer): void {
    if (!this.incomingFileInfo) {
      console.warn('[WARN] Received a file chunk but have no file metadata. Discarding.');
      return;
    }
    this.receivedFileChunks.push(chunk);
    this.receivedBytes += chunk.byteLength;
    
    // Simple progress logging
    const progress = (this.receivedBytes / this.incomingFileInfo.size) * 100;
    console.log(`[LOG] Received file chunk. Progress: ${progress.toFixed(2)}%`);

    // Check if the file transfer is complete
    if (this.receivedBytes === this.incomingFileInfo.size) {
      console.log(`[LOG] File transfer complete for: ${this.incomingFileInfo.name}`);
      const fileBlob = new Blob(this.receivedFileChunks, { type: this.incomingFileInfo.type });
      this.zone.run(() => {
        this.receivedFile$.next({
          name: this.incomingFileInfo!.name,
          type: this.incomingFileInfo!.type,
          blob: fileBlob,
        });
      });

      // Reset file transfer state for the next file
      this.incomingFileInfo = null;
      this.receivedFileChunks = [];
      this.receivedBytes = 0;
    }
  }

  private async handleSignalingMessage(message: SignalingMessage): Promise<void> {
    this.zone.run(async () => {
      console.log(`[LOG] Handling signaling message of type: ${message.type}`);
      
      if (!this.peerConnection && message.type === 'offer') {
        this.initializePeerConnection();
      }

      switch (message.type) {
        case 'offer':
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
          console.log('[LOG] Remote description (offer) set. Creating answer...');
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          console.log('[LOG] Answer created and set as local description. Sending to peer...');
          this.sendSignalingMessage('answer', answer);
          break;

        case 'answer':
          console.log('[LOG] Received answer. Setting remote description...');
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
          break;

        case 'ice-candidate':
          if (this.peerConnection) {
            console.log('[LOG] Received and adding new ICE candidate.');
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(message.data));
          }
          break;

        case 'file-meta':
          console.log('[LOG] Received file metadata:', message.data);
          this.incomingFileInfo = message.data as FileMetadata;
          this.receivedFileChunks = [];
          this.receivedBytes = 0;
          break;
      }
    });
  }

  private sendSignalingMessage(type: SignalingMessage['type'], data: any): void {
    const message: SignalingMessage = { type, data };
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log(`[LOG] Sending signaling message of type: ${type}`);
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('[ERROR] Cannot send signaling message. WebSocket is not open.');
    }
  }
}