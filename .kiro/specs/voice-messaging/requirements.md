# Requirements Document

## Introduction

This document specifies the requirements for adding voice message recording and playback functionality to the VitalMatch messaging system. The feature enables users to record audio messages using their device microphone, send them within existing conversations, and play back received audio messages with visual controls. This enhances communication between blood donors, beneficiaries, and administrators by providing a richer, more personal messaging experience.

## Glossary

- **Voice_Message_System**: The complete system for recording, storing, transmitting, and playing back audio messages
- **Audio_Recorder**: The client-side component that captures audio from the user's microphone
- **Audio_Player**: The client-side component that plays back recorded audio messages
- **Message_Controller**: The server-side controller that handles message operations (existing component, extended for voice messages)
- **Message_Model**: The database model representing messages (existing component, extended for voice messages)
- **Audio_File**: The recorded audio data stored as a file on the server
- **Waveform_Visualizer**: The UI component that displays a visual representation of audio amplitude
- **Recording_Controls**: The UI elements for starting, stopping, and canceling audio recording
- **Playback_Controls**: The UI elements for playing, pausing, and seeking through audio messages
- **Conversation_View**: The messaging interface where users view and send messages (existing component)
- **File_Storage_Service**: The server-side service that manages audio file storage and retrieval

## Requirements

### Requirement 1: Audio Recording

**User Story:** As a VitalMatch user, I want to record audio messages using my microphone, so that I can communicate more personally with other users.

#### Acceptance Criteria

1. WHEN a user clicks the record button in the Conversation_View, THE Audio_Recorder SHALL request microphone permission from the browser
2. IF microphone permission is denied, THEN THE Voice_Message_System SHALL display an error message explaining that microphone access is required
3. WHEN microphone permission is granted, THE Audio_Recorder SHALL begin capturing audio and display a recording indicator
4. WHILE recording is active, THE Recording_Controls SHALL display the elapsed recording time in seconds
5. WHILE recording is active, THE Recording_Controls SHALL display a visual waveform of the audio being captured
6. THE Audio_Recorder SHALL support recording durations between 1 second and 120 seconds
7. IF recording duration reaches 120 seconds, THEN THE Audio_Recorder SHALL automatically stop recording and prepare the audio for sending
8. WHEN a user clicks the stop button during recording, THE Audio_Recorder SHALL stop capturing audio and prepare the audio for sending
9. WHEN a user clicks the cancel button during recording, THE Audio_Recorder SHALL discard the recorded audio and return to the normal message input state
10. THE Audio_Recorder SHALL encode recorded audio in WebM format with Opus codec

### Requirement 2: Audio Message Transmission

**User Story:** As a VitalMatch user, I want to send recorded audio messages to other users, so that they can hear my voice message.

#### Acceptance Criteria

1. WHEN a user completes an audio recording, THE Voice_Message_System SHALL display a preview with playback controls and a send button
2. WHEN a user clicks the send button, THE Voice_Message_System SHALL upload the Audio_File to the server
3. WHILE uploading, THE Voice_Message_System SHALL display an upload progress indicator
4. WHEN the Audio_File upload completes, THE Message_Controller SHALL store the file path in the Message_Model
5. WHEN the Audio_File upload completes, THE Message_Controller SHALL create a new message record with messageType set to "voice"
6. IF the upload fails, THEN THE Voice_Message_System SHALL display an error message and allow the user to retry
7. WHEN a voice message is successfully sent, THE Conversation_View SHALL display the voice message in the conversation
8. THE File_Storage_Service SHALL store Audio_Files in a dedicated directory with unique filenames
9. THE File_Storage_Service SHALL generate filenames using the pattern: "voice_{timestamp}_{randomId}.webm"

### Requirement 3: Audio Message Storage

**User Story:** As a system administrator, I want voice messages stored securely and efficiently, so that the system remains performant and maintainable.

#### Acceptance Criteria

1. THE Message_Model SHALL include a messageType field that accepts values "text" or "voice"
2. THE Message_Model SHALL include an audioFilePath field for storing the relative path to Audio_Files
3. THE Message_Model SHALL include an audioDuration field for storing the length of voice messages in seconds
4. WHERE messageType is "voice", THE Message_Model SHALL require audioFilePath to be non-null
5. WHERE messageType is "text", THE Message_Model SHALL require the message field to be non-null
6. THE File_Storage_Service SHALL store Audio_Files in the "public/uploads/voice-messages" directory
7. THE File_Storage_Service SHALL validate that uploaded files are audio files with WebM format
8. THE File_Storage_Service SHALL reject files larger than 5 megabytes
9. IF file validation fails, THEN THE File_Storage_Service SHALL return an error response with status code 400

### Requirement 4: Audio Message Playback

**User Story:** As a VitalMatch user, I want to play back received voice messages, so that I can hear what other users have sent me.

#### Acceptance Criteria

1. WHEN a voice message is displayed in the Conversation_View, THE Voice_Message_System SHALL render it with a distinct visual appearance from text messages
2. THE Playback_Controls SHALL display a play button, waveform visualization, and duration label
3. WHEN a user clicks the play button, THE Audio_Player SHALL fetch the Audio_File from the server and begin playback
4. WHILE audio is playing, THE Playback_Controls SHALL display a pause button instead of the play button
5. WHILE audio is playing, THE Playback_Controls SHALL display a progress indicator showing current playback position
6. WHEN a user clicks the pause button, THE Audio_Player SHALL pause playback at the current position
7. WHEN a user clicks the play button after pausing, THE Audio_Player SHALL resume playback from the paused position
8. WHEN a user clicks on the waveform, THE Audio_Player SHALL seek to the corresponding position in the audio
9. WHEN playback completes, THE Playback_Controls SHALL reset to the initial state with the play button visible
10. IF the Audio_File fails to load, THEN THE Voice_Message_System SHALL display an error message indicating the audio is unavailable

### Requirement 5: Waveform Visualization

**User Story:** As a VitalMatch user, I want to see a visual representation of voice messages, so that I can understand the audio content at a glance.

#### Acceptance Criteria

1. WHEN recording audio, THE Waveform_Visualizer SHALL display a real-time waveform based on audio amplitude
2. WHEN displaying a sent or received voice message, THE Waveform_Visualizer SHALL display a static waveform representation
3. THE Waveform_Visualizer SHALL render waveforms using HTML5 Canvas or SVG elements
4. THE Waveform_Visualizer SHALL use a color scheme consistent with the VitalMatch design system
5. WHERE a message is sent by the current user, THE Waveform_Visualizer SHALL use white or light colors on the red background
6. WHERE a message is received from another user, THE Waveform_Visualizer SHALL use dark colors on the gray background
7. THE Waveform_Visualizer SHALL generate waveform data by sampling audio amplitude at regular intervals
8. THE Waveform_Visualizer SHALL store waveform data as a JSON array in the Message_Model

### Requirement 6: User Interface Integration

**User Story:** As a VitalMatch user, I want voice messaging controls integrated seamlessly into the existing chat interface, so that I can easily switch between text and voice messages.

#### Acceptance Criteria

1. THE Conversation_View SHALL display a microphone button next to the text message input field
2. WHEN a user clicks the microphone button, THE Voice_Message_System SHALL replace the message input area with Recording_Controls
3. WHEN recording is canceled or a voice message is sent, THE Voice_Message_System SHALL restore the normal message input area
4. THE Voice_Message_System SHALL display voice messages with a distinct visual style including an audio icon
5. THE Voice_Message_System SHALL display the duration of voice messages in the format "MM:SS"
6. WHERE a voice message is unplayed, THE Voice_Message_System SHALL display a visual indicator such as a blue dot
7. WHEN a user plays a voice message for the first time, THE Voice_Message_System SHALL mark it as played
8. THE Conversation_View SHALL display voice messages in chronological order with text messages
9. THE Conversation_View SHALL display timestamps for voice messages consistent with text message timestamps

### Requirement 7: Browser Compatibility

**User Story:** As a VitalMatch user, I want voice messaging to work on my browser, so that I can use the feature regardless of my device.

#### Acceptance Criteria

1. THE Audio_Recorder SHALL use the MediaRecorder API for audio capture
2. THE Voice_Message_System SHALL detect browser support for the MediaRecorder API on page load
3. IF the browser does not support the MediaRecorder API, THEN THE Voice_Message_System SHALL hide the microphone button
4. IF the browser does not support the MediaRecorder API, THEN THE Voice_Message_System SHALL display received voice messages with a download link
5. THE Audio_Player SHALL use the HTML5 Audio element for playback
6. THE Voice_Message_System SHALL support Chrome version 49 and above
7. THE Voice_Message_System SHALL support Firefox version 25 and above
8. THE Voice_Message_System SHALL support Safari version 14 and above
9. THE Voice_Message_System SHALL support Edge version 79 and above

### Requirement 8: Error Handling

**User Story:** As a VitalMatch user, I want clear error messages when voice messaging fails, so that I understand what went wrong and how to fix it.

#### Acceptance Criteria

1. IF microphone access is denied, THEN THE Voice_Message_System SHALL display "Microphone access is required to record voice messages. Please enable it in your browser settings."
2. IF recording fails due to a technical error, THEN THE Voice_Message_System SHALL display "Recording failed. Please try again."
3. IF file upload fails due to network error, THEN THE Voice_Message_System SHALL display "Upload failed. Please check your connection and try again."
4. IF file upload fails due to file size, THEN THE Voice_Message_System SHALL display "Audio file is too large. Maximum size is 5MB."
5. IF audio playback fails, THEN THE Voice_Message_System SHALL display "Unable to play audio. The file may be corrupted or unavailable."
6. IF the browser does not support voice messaging, THEN THE Voice_Message_System SHALL display "Your browser does not support voice messaging. Please use a modern browser."
7. WHEN an error occurs, THE Voice_Message_System SHALL log the error details to the browser console for debugging
8. WHEN an error occurs during upload, THE Voice_Message_System SHALL allow the user to retry without re-recording

### Requirement 9: Performance and Optimization

**User Story:** As a VitalMatch user, I want voice messages to load and play quickly, so that my conversations flow smoothly.

#### Acceptance Criteria

1. THE Audio_Recorder SHALL compress audio to achieve a target bitrate of 32 kbps for voice quality
2. THE File_Storage_Service SHALL serve Audio_Files with appropriate caching headers
3. THE Audio_Player SHALL preload audio metadata when a voice message is displayed
4. THE Audio_Player SHALL not preload the full audio file until the user initiates playback
5. THE Waveform_Visualizer SHALL generate waveforms with a maximum of 100 data points to minimize storage
6. WHEN loading a conversation with multiple voice messages, THE Voice_Message_System SHALL lazy-load audio files
7. THE Voice_Message_System SHALL display a loading indicator while fetching audio files
8. THE Message_Controller SHALL respond to voice message send requests within 2 seconds under normal network conditions

### Requirement 10: Security and Privacy

**User Story:** As a VitalMatch user, I want my voice messages to be secure and private, so that only intended recipients can access them.

#### Acceptance Criteria

1. THE Message_Controller SHALL verify that the requesting user is either the sender or receiver before serving an Audio_File
2. IF an unauthorized user requests an Audio_File, THEN THE Message_Controller SHALL return an error response with status code 403
3. THE File_Storage_Service SHALL generate unique, non-guessable filenames for Audio_Files
4. THE Voice_Message_System SHALL transmit Audio_Files over HTTPS in production environments
5. THE Message_Controller SHALL validate the conversationId before accepting voice message uploads
6. THE Message_Controller SHALL validate that the sender is a participant in the conversation
7. THE File_Storage_Service SHALL sanitize uploaded filenames to prevent directory traversal attacks
8. THE File_Storage_Service SHALL validate file MIME types to ensure only audio files are accepted
