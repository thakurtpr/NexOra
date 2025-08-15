import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';

interface SignalingMessage { type: 'offer' | 'answer' | 'ice-candidate' | 'file-meta'; data: any; }
interface FileMetadata { name: string; size: number; type: string; }
const CHUNK_SIZE = 64 * 1024;

@Injectable({ providedIn: 'root' })
export class WebrtcService {
  private ws!: WebSocket;
  private peerConnection!: RTCPeerConnection;
  private dataChannel!: RTCDataChannel;
  private incomingFileInfo: FileMetadata | null = null;
  private receivedFileChunks: ArrayBuffer[] = [];
  private receivedBytes = 0;
  public receivedMessage$ = new Subject<any>();
  public receivedFile$ = new Subject<{ name: string; type: string; blob: Blob }>();
  public connectionState$ = new Subject<string>();

  constructor(private zone: NgZone) {}

  public connect(roomId: string) {
    if (!roomId) { return; }
    this.connectionState$.next('Connecting...');
    this.ws = new WebSocket(`ws://localhost:3000/ws/${roomId}`);
    this.ws.onerror = (errorEvent) => {
        console.error('WebSocket connection error:', errorEvent);
        this.zone.run(() => this.connectionState$.next('Connection Failed!'));
    };
    this.ws.onopen = () => this.zone.run(() => this.connectionState$.next('Connected! Waiting for another user...'));
    this.ws.onclose = () => this.zone.run(() => this.connectionState$.next('Disconnected from signaling server.'));
    this.ws.onmessage = (event) => this.handleSignalingMessage(JSON.parse(event.data));
  }

  public async startCall() {
    this.initializePeerConnection();
    this.dataChannel = this.peerConnection.createDataChannel('dataChannel');
    this.setupDataChannelEvents();
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    this.sendSignalingMessage('offer', offer);
  }

  public sendMessage(message: string | object): void {
    if (this.dataChannel?.readyState !== 'open') return;
    const dataToSend = typeof message === 'string' ? message : JSON.stringify(message);
    this.dataChannel.send(dataToSend);
  }

  public sendFile(file: File) {
    if (this.dataChannel?.readyState !== 'open') return;
    const metadata: FileMetadata = { name: file.name, size: file.size, type: file.type };
    this.sendSignalingMessage('file-meta', metadata);
    let offset = 0;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (!e.target?.result) return;
      const chunk = e.target.result as ArrayBuffer;
      this.dataChannel.send(chunk);
      offset += chunk.byteLength;
      if (offset < file.size) { readSlice(offset); }
    };
    const readSlice = (o: number) => {
      const slice = file.slice(o, o + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };
    readSlice(0);
  }

  public leaveRoom() {
    console.log("Leaving room and cleaning up connections...");
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    if (this.ws) {
      this.ws.close();
    }
    this.receivedMessage$ = new Subject<any>();
    this.receivedFile$ = new Subject<{ name: string; type: string; blob: Blob }>();
    this.connectionState$ = new Subject<string>();
  }

  private initializePeerConnection() {
    this.peerConnection = new RTCPeerConnection();
    this.peerConnection.onicecandidate = e => e.candidate && this.sendSignalingMessage('ice-candidate', e.candidate);
    this.peerConnection.ondatachannel = e => {
      this.dataChannel = e.channel;
      this.setupDataChannelEvents();
    };
    this.peerConnection.onconnectionstatechange = () => this.zone.run(() => this.connectionState$.next(`Connection state: ${this.peerConnection.connectionState}`));
  }

  private setupDataChannelEvents() {
    this.dataChannel.binaryType = 'arraybuffer';
    this.dataChannel.onopen = () => this.zone.run(() => this.connectionState$.next('Data Channel Open!'));
    this.dataChannel.onmessage = (event) => this.zone.run(() => {
        if (typeof event.data === 'string') {
          try { this.receivedMessage$.next(JSON.parse(event.data)); } 
          catch { this.receivedMessage$.next({ text: event.data, sender: 'peer' }); }
        } else {
          this.handleFileChunk(event.data);
        }
    });
  }

  private handleFileChunk(chunk: ArrayBuffer) {
     if (!this.incomingFileInfo) return;
     this.receivedFileChunks.push(chunk);
     this.receivedBytes += chunk.byteLength;
     if (this.receivedBytes === this.incomingFileInfo.size) {
       const fileBlob = new Blob(this.receivedFileChunks, { type: this.incomingFileInfo!.type });
       this.zone.run(() => this.receivedFile$.next({
           name: this.incomingFileInfo!.name,
           type: this.incomingFileInfo!.type,
           blob: fileBlob
       }));
       this.incomingFileInfo = null;
       this.receivedFileChunks = [];
       this.receivedBytes = 0;
     }
  }

  private async handleSignalingMessage(message: SignalingMessage) {
    this.zone.run(async () => {
      if (!this.peerConnection && message.type === 'offer') {
          this.initializePeerConnection();
      }
      switch (message.type) {
        case 'offer':
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          this.sendSignalingMessage('answer', answer);
          break;
        case 'answer':
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
          break;
        case 'ice-candidate':
           if (this.peerConnection) { await this.peerConnection.addIceCandidate(new RTCIceCandidate(message.data)); }
          break;
        case 'file-meta':
          this.incomingFileInfo = message.data as FileMetadata;
          this.receivedFileChunks = [];
          this.receivedBytes = 0;
          break;
      }
    });
  }

  private sendSignalingMessage(type: SignalingMessage['type'], data: any) {
    const message: SignalingMessage = { type, data };
    if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
    }
  }
}