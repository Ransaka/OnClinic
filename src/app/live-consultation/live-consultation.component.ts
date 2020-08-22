import { Component, OnInit } from '@angular/core';
import { NgxAgoraService, Stream, AgoraClient, ClientEvent, StreamEvent } from 'ngx-agora';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { RecordingService } from '../services/recording.service';
import { DomSanitizer } from '@angular/platform-browser';
// import { chunk } from 'lodash';
// import * as RecordRTC from 'recordrtc';
// import { createWriteStream } from 'fs';
declare var RecordRTC_Extension: any;

@Component({
  selector: 'app-live-consultation',
  templateUrl: './live-consultation.component.html',
  styleUrls: ['./live-consultation.component.css']
})
export class LiveConsultationComponent implements OnInit {
  isRecording = false;
  recordedTime;
  blobUrl;

  channelForm: FormGroup;

  localCallId = 'agora_local';
  remoteCalls: any[] = []

  private client: AgoraClient;
  private localStream: Stream;
  private uid: number;
  private channelid: any;
  record_tool: any;


  constructor(
    // private recorde_tool: RecordRTC_Extension,
    private ngxAgoraService: NgxAgoraService,
    private formbuilder: FormBuilder,
    private recorder: RecordingService,
    private sanitizer: DomSanitizer
  ) {
    this.record_tool = new RecordRTC_Extension();
    this.uid = Math.floor(Math.random() * 100);
    this.recorder.recordingFailed().subscribe(() => {
      this.isRecording = false
    });

    this.recorder.getRecordedTime().subscribe((time) => {
      this.recordedTime = time
    });

    this.recorder.getRecordedBlob().subscribe((data) => {
      this.blobUrl = this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(data.blob));
    });
  }

  startRecording() {
    if (!this.isRecording) {
      this.isRecording = true;
      this.recorder.startRecording()
    }
  }

  abortRecording() {
    if (this.isRecording) {
      this.isRecording = false;
      this.recorder.abortRecording();
    }
  }

  stopRecording() {
    if (this.isRecording) {
      this.recorder.stopRecording();
      this.isRecording = false;
    }
  }

  clearRecordedData() {
    this.blobUrl = null;
  }

  ngOnInit() {

    this.channelForm = this.formbuilder.group({
      channelid: ["", Validators.required]
    });

    // this.client = this.ngxAgoraService.createClient({ mode: 'rtc', codec: 'h264' });
    // this.assignClientHandlers();

    // // Added in this step to initialize the local A/V stream
    // this.localStream = this.ngxAgoraService.createStream({ streamID: this.uid, audio: true, video: true, screen: false });
    // this.assignLocalStreamHandlers();
    // // this.initLocalStream();
    // this.initLocalStream(() => this.join(uid => this.publish(), error => console.error(error)));
    // this.test()
  }

  // test() {
  //   this.record_tool.startRecording({
  //     enableScreen: true,
  //     enableMicrophone: true,
  //     enableSpeakers: true
  //   });

  //   // btnStopRecording.onclick = function () {
  //     this.record_tool.stopRecording(function (blob) {
  //       console.log(blob.size, blob);
  //       var url = URL.createObjectURL(blob);
  //       // video.src = url;
  //       console.log(url)
  //     });
  //   // }
  // }

  startCall() {

    let channelID = this.channelForm.controls["channelid"].value;
    console.log("Channel ID - ", channelID);

    this.channelid = channelID;

    this.client = this.ngxAgoraService.createClient({ mode: 'rtc', codec: 'h264' });
    this.assignClientHandlers();

    // Added in this step to initialize the local A/V stream
    this.localStream = this.ngxAgoraService.createStream({ streamID: this.uid, audio: true, video: true, screen: false });
    this.assignLocalStreamHandlers();
    // this.initLocalStream();
    this.initLocalStream(() => this.join(uid => this.publish(), error => console.error(error)));

  }

  endCall() {
    this.client.leave(() => {

      if (this.localStream.isPlaying()) {
        this.localStream.stop()
      }
      this.localStream.close();

      for (let i = 0; i < this.remoteCalls.length; i++) {
        var stream = this.remoteCalls.shift();
        var id = stream.getId()
        if (stream.isPlaying()) {
          stream.stop()
        }
        // removeView(id)
      }
    })
  }

  /**
 * Attempts to connect to an online chat room where users can host and receive A/V streams.
 */
  join(onSuccess?: (uid: number | string) => void, onFailure?: (error: Error) => void): void {
    this.client.join(null, this.channelid, this.uid, onSuccess, onFailure);
  }

  /**
   * Attempts to upload the created local A/V stream to a joined chat room.
   */
  publish(): void {
    this.client.publish(this.localStream, err => console.log('Publish local stream error: ' + err));
  }

  private assignLocalStreamHandlers(): void {
    this.localStream.on(StreamEvent.MediaAccessAllowed, () => {
      console.log('accessAllowed');
    });

    // The user has denied access to the camera and mic.
    this.localStream.on(StreamEvent.MediaAccessDenied, () => {
      console.log('accessDenied');
    });
  }

  private initLocalStream(onSuccess?: () => any): void {
    this.localStream.init(
      () => {
        // The user has granted access to the camera and mic.
        this.localStream.play(this.localCallId);
        if (onSuccess) {
          onSuccess();
        }
      },
      err => console.error('getUserMedia failed', err)
    );
  }

  private assignClientHandlers(): void {
    this.client.on(ClientEvent.LocalStreamPublished, evt => {
      console.log('Publish local stream successfully');
    });

    this.client.on(ClientEvent.Error, error => {
      console.log('Got error msg:', error.reason);
      if (error.reason === 'DYNAMIC_KEY_TIMEOUT') {
        this.client.renewChannelKey(
          '',
          () => console.log('Renewed the channel key successfully.'),
          renewError => console.error('Renew channel key failed: ', renewError)
        );
      }
    });

    this.client.on(ClientEvent.RemoteStreamAdded, evt => {
      const stream = evt.stream as Stream;
      this.client.subscribe(stream, { audio: true, video: true }, err => {
        console.log('Subscribe stream failed', err);
      });
    });

    this.client.on(ClientEvent.RemoteStreamSubscribed, evt => {
      const stream = evt.stream as Stream;
      const id = this.getRemoteId(stream);
      if (!this.remoteCalls.length) {
        this.remoteCalls.push(id);
        setTimeout(() => stream.play(id), 1000);
      }
    });

    this.client.on(ClientEvent.RemoteStreamRemoved, evt => {
      const stream = evt.stream as Stream;
      if (stream) {
        stream.stop();
        this.remoteCalls = [];
        console.log(`Remote stream is removed ${stream.getId()}`);
      }
    });

    this.client.on(ClientEvent.PeerLeave, evt => {
      const stream = evt.stream as Stream;
      if (stream) {
        stream.stop();
        this.remoteCalls = this.remoteCalls.filter(call => call !== `${this.getRemoteId(stream)}`);
        console.log(`${evt.uid} left from this channel`);
      }
    });
  }

  private getRemoteId(stream: Stream): string {
    return `agora_remote-${stream.getId()}`;
  }

  // startRecording() {

  // }

}
