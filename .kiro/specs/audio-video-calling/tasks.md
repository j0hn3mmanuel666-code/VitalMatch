# Implementation Plan: Audio-Video Calling Feature

## Overview

This plan implements real-time audio and video calling capabilities for VitalMatch using WebRTC for peer-to-peer communication and Socket.io for signaling. The implementation follows a bottom-up approach: database and server infrastructure first, then client-side components, and finally UI integration.

## Tasks

- [x] 1. Set up database and server infrastructure
  - [x] 1.1 Create Call model and database migration
    - Create `models/callModel.js` with Sequelize model definition
    - Create migration file for Calls table with indexes
    - Define relationships with User model
    - _Requirements: 10.2, 8.3, 5.4_
  
  - [ ]* 1.2 Write property test for call model
    - **Property 20: Call History Recording**
    - **Validates: Requirements 10.2, 8.3, 5.4**
  
  - [x] 1.3 Implement CallHistoryService
    - Create `services/callHistoryService.js` with all CRUD operations
    - Implement createCallRecord, updateCallOutcome, getCallHistory methods
    - Implement getCallHistoryForConversation and analytics methods
    - _Requirements: 10.2, 10.3, 18.1_
  
  - [ ]* 1.4 Write unit tests for CallHistoryService
    - Test call record creation and updates
    - Test query methods with various filters
    - Test analytics aggregation
    - _Requirements: 10.2, 10.3, 18.1_

- [x] 2. Implement Socket.io signaling server
  - [x] 2.1 Set up Socket.io server with session authentication
    - Create `services/signalingServer.js` class
    - Configure Socket.io with session middleware
    - Implement connection authentication
    - Maintain active user connections map
    - _Requirements: 13.2, 13.5_
  
  - [x] 2.2 Implement signaling message handlers
    - Handle call:offer event with validation
    - Handle call:answer event
    - Handle call:ice-candidate event
    - Handle call:decline and call:end events
    - Implement message routing to recipient
    - _Requirements: 1.1, 4.5, 5.1, 8.2_
  
  - [ ]* 2.3 Write property test for participant authorization
    - **Property 31: Participant Authorization**
    - **Validates: Requirements 13.3, 13.4**
  
  - [x] 2.4 Implement user online status and error handling
    - Check if recipient is online before forwarding offer
    - Send error event when recipient is offline
    - Handle socket disconnection cleanup
    - _Requirements: 1.3, 9.4_
  
  - [ ]* 2.5 Write unit tests for signaling server
    - Test message routing between users
    - Test offline recipient error handling
    - Test authentication rejection
    - Test simultaneous call detection
    - _Requirements: 1.3, 11.1, 13.2_

- [ ] 3. Checkpoint - Ensure server tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement REST API endpoints for call history
  - [x] 4.1 Create call controller with history endpoints
    - Create `controllers/callController.js`
    - Implement GET /api/calls/history endpoint
    - Implement GET /api/calls/history/:conversationId endpoint
    - Implement POST /api/calls/:callId/seen endpoint
    - Add session-based authentication middleware
    - _Requirements: 10.1, 10.3, 17.5_
  
  - [x] 4.2 Implement admin analytics endpoint
    - Implement GET /api/calls/analytics endpoint
    - Add admin authorization check
    - Return aggregate statistics without user data
    - _Requirements: 18.1, 18.2, 18.5_
  
  - [ ]* 4.3 Write property test for analytics authorization
    - **Property 40: Analytics Authorization**
    - **Validates: Requirements 18.2**
  
  - [x] 4.4 Add call routes to Express app
    - Create `routes/callRoutes.js`
    - Register routes in main app.js
    - _Requirements: 10.1, 18.2_

- [x] 5. Implement client-side WebRTC manager
  - [x] 5.1 Create WebRTCManager class
    - Create `public/js/webrtcManager.js`
    - Implement media permission request methods
    - Implement getLocalStream with audio/video constraints
    - Configure RTCPeerConnection with ICE servers
    - _Requirements: 2.1, 4.2, 14.3, 14.4, 14.5_
  
  - [ ]* 5.2 Write property test for permission request
    - **Property 4: Video Call Permission Request**
    - **Validates: Requirements 2.1, 4.2**
  
  - [x] 5.3 Implement SDP offer/answer exchange
    - Implement createOffer method
    - Implement createAnswer method
    - Implement handleAnswer method
    - Handle ontrack event for remote stream
    - _Requirements: 4.1, 4.5_
  
  - [x] 5.4 Implement ICE candidate handling
    - Implement addIceCandidate method
    - Handle onicecandidate event
    - Configure ICE candidate pool
    - _Requirements: 4.5_
  
  - [x] 5.5 Implement media controls
    - Implement toggleMute method
    - Implement toggleVideo method
    - Implement switchCamera method for mobile
    - Implement releaseLocalStream cleanup
    - _Requirements: 6.1, 6.2, 7.3, 7.5_
  
  - [ ]* 5.6 Write property test for mute functionality
    - **Property 15: Mute Functionality**
    - **Validates: Requirements 6.2**
  
  - [x] 5.7 Implement connection monitoring
    - Implement getConnectionState method
    - Implement getNetworkQuality method
    - Handle onconnectionstatechange event
    - _Requirements: 6.5, 9.2, 9.5_
  
  - [ ]* 5.8 Write unit tests for WebRTCManager
    - Test permission denial handling
    - Test connection state transitions
    - Test media control methods
    - _Requirements: 2.2, 4.3, 6.2, 7.3_

- [x] 6. Implement client-side signaling client
  - [x] 6.1 Create SignalingClient class
    - Create `public/js/signalingClient.js`
    - Implement Socket.io connection with authentication
    - Implement connect and disconnect methods
    - _Requirements: 13.5_
  
  - [x] 6.2 Implement outgoing signaling methods
    - Implement sendCallOffer method
    - Implement sendCallAnswer method
    - Implement sendIceCandidate method
    - Implement sendCallDecline and sendCallEnd methods
    - _Requirements: 1.1, 4.1, 4.5, 5.1, 8.1_
  
  - [x] 6.3 Implement incoming signaling event handlers
    - Handle call:incoming event
    - Handle call:accepted event
    - Handle call:declined event
    - Handle call:ended event
    - Handle call:ice-candidate event
    - Handle call:error event
    - Set up event callbacks for CallManager
    - _Requirements: 3.1, 4.1, 5.5, 8.2, 1.3_
  
  - [ ]* 6.4 Write unit tests for SignalingClient
    - Test connection establishment
    - Test message sending
    - Test event handler registration
    - _Requirements: 1.1, 3.1, 8.2_

- [ ] 7. Checkpoint - Ensure client core tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [-] 8. Implement call state management
  - [-] 8.1 Create CallManager class with state machine
    - Create `public/js/callManager.js`
    - Define call states (idle, calling, ringing, active, ended)
    - Implement state transition logic
    - Initialize with userId, signalingClient, webrtcManager, callUI
    - _Requirements: 1.2, 3.1, 4.4_
  
  - [ ] 8.2 Implement call initiation flow
    - Implement initiateCall method for audio and video
    - Request media permissions before signaling
    - Send offer through signaling client
    - Display calling indicator
    - Handle permission denial errors
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3_
  
  - [ ]* 8.3 Write property test for call initiation signaling
    - **Property 1: Call Initiation Signaling**
    - **Validates: Requirements 1.1, 1.4, 2.3**
  
  - [ ]* 8.4 Write property test for permission denial handling
    - **Property 5: Permission Denial Handling**
    - **Validates: Requirements 2.2, 4.3**
  
  - [ ] 8.5 Implement incoming call handling
    - Implement handleIncomingCall method
    - Display incoming call notification with caller info
    - Play ringtone sound
    - Implement 30-second auto-decline timeout
    - Auto-decline if already in call
    - _Requirements: 3.1, 3.2, 3.4, 3.5_
  
  - [ ]* 8.6 Write property test for incoming call notification
    - **Property 7: Incoming Call Notification Content**
    - **Validates: Requirements 3.1, 3.3**
  
  - [ ]* 8.7 Write property test for busy call rejection
    - **Property 10: Busy Call Rejection**
    - **Validates: Requirements 3.5**
  
  - [ ] 8.6 Implement call acceptance flow
    - Implement acceptCall method
    - Request permissions for video calls
    - Create and send answer
    - Exchange ICE candidates
    - Transition to active state within 10 seconds
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [ ] 8.7 Implement call decline flow
    - Implement declineCall method
    - Send decline notification to caller
    - Stop ringtone immediately
    - Record declined call in history
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [ ]* 8.8 Write property test for call decline notification
    - **Property 13: Call Decline Notification**
    - **Validates: Requirements 5.1, 5.3, 5.4, 5.5**
  
  - [ ] 8.8 Implement call termination flow
    - Implement endCall method
    - Close all media streams
    - Notify other participant
    - Record call in history with duration
    - Release permissions
    - Return to messaging interface within 2 seconds
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [ ]* 8.9 Write property test for call termination cleanup
    - **Property 19: Call Termination Cleanup**
    - **Validates: Requirements 8.1, 8.2, 8.4, 8.5**
  
  - [ ] 8.9 Implement connection failure handling
    - Handle WebRTC connection timeout (30 seconds)
    - Handle stream interruption (10 seconds)
    - Implement reconnection logic (30 seconds max)
    - Display appropriate error messages
    - Log all errors with details
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  
  - [ ]* 8.10 Write property test for connection interruption handling
    - **Property 21: Connection Interruption Handling**
    - **Validates: Requirements 9.2, 9.3**
  
  - [ ] 8.10 Implement simultaneous call detection
    - Detect when both users call each other within 2 seconds
    - Cancel both attempts and notify users
    - Auto-connect if one user calls while receiving call from them
    - Log simultaneous call events
    - _Requirements: 11.1, 11.2, 11.3, 11.5_
  
  - [ ]* 8.11 Write property test for simultaneous call detection
    - **Property 25: Simultaneous Call Detection**
    - **Validates: Requirements 11.1, 11.2, 11.3**
  
  - [ ]* 8.12 Write unit tests for CallManager state machine
    - Test all state transitions
    - Test timeout behaviors
    - Test error handling paths
    - _Requirements: 3.4, 4.4, 9.1_

- [ ] 9. Implement call UI components
  - [ ] 9.1 Create CallUI class structure
    - Create `public/js/callUI.js`
    - Initialize with container element and CallManager reference
    - Create HTML templates for call interface elements
    - _Requirements: 16.1_
  
  - [ ] 9.2 Implement incoming call notification UI
    - Implement showIncomingCallNotification method
    - Display caller name and call type
    - Add accept and decline buttons
    - Implement hideIncomingCallNotification method
    - _Requirements: 3.1, 3.3_
  
  - [ ] 9.3 Implement active call interface
    - Implement showCallInterface method for audio and video
    - Display call controls (mute, end, video toggle)
    - Display call duration timer
    - Display network quality indicator
    - Implement hideCallInterface method
    - _Requirements: 6.1, 6.3, 6.4, 6.5_
  
  - [ ]* 9.4 Write property test for active call UI controls
    - **Property 14: Active Call UI Controls**
    - **Validates: Requirements 6.1, 6.3, 6.4, 6.5**
  
  - [ ] 9.4 Implement video stream display
    - Implement attachLocalStream method
    - Implement attachRemoteStream method
    - Display remote video in main view
    - Display local video in picture-in-picture overlay
    - Implement detachStreams cleanup method
    - _Requirements: 7.1, 7.2, 2.4_
  
  - [ ]* 9.5 Write property test for video stream display
    - **Property 16: Video Stream Display**
    - **Validates: Requirements 7.1, 7.2**
  
  - [ ] 9.5 Implement call status indicators
    - Implement showCallingIndicator method
    - Implement showConnectedIndicator method
    - Implement showReconnectingIndicator method
    - Implement updateCallDuration method
    - Implement updateNetworkQuality method
    - _Requirements: 1.2, 2.5, 6.4, 6.5, 9.2_
  
  - [ ] 9.6 Implement control state updates
    - Implement setMuteState method
    - Implement setVideoState method
    - Update button visual states
    - _Requirements: 6.2, 7.3_
  
  - [ ] 9.7 Implement error display
    - Implement showError method
    - Display permission denial errors with instructions
    - Display connection failure errors
    - Display offline recipient errors
    - _Requirements: 1.3, 2.2, 9.1, 12.2_
  
  - [ ]* 9.8 Write property test for permission denial instructions
    - **Property 28: Permission Denial Instructions**
    - **Validates: Requirements 12.2, 12.3**
  
  - [ ]* 9.9 Write unit tests for CallUI
    - Test UI element creation and updates
    - Test button click handlers
    - Test stream attachment
    - _Requirements: 3.1, 6.1, 7.1_

- [ ] 10. Checkpoint - Ensure call flow tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [-] 11. Integrate with messaging interface
  - [x] 11.1 Add call buttons to messages page
    - Modify `views/messages.xian` to include audio and video call buttons
    - Add buttons to conversation header
    - Load call-related JavaScript modules
    - _Requirements: 16.1_
  
  - [x] 11.2 Initialize call system on messages page
    - Create initialization script in messages.xian
    - Instantiate SignalingClient, WebRTCManager, CallUI, CallManager
    - Connect to Socket.io server with authentication
    - Wire up all components
    - _Requirements: 16.2, 16.3_
  
  - [ ] 11.3 Implement call history display
    - Add call history section to conversation view
    - Display recent calls with timestamps and outcomes
    - Show incoming/outgoing indicators
    - Display missed call indicators
    - Implement click handler to initiate new call
    - _Requirements: 10.1, 10.3, 10.4, 10.5, 17.2_
  
  - [ ]* 11.4 Write property test for call history ordering
    - **Property 23: Call History Ordering**
    - **Validates: Requirements 10.3**
  
  - [ ] 11.4 Integrate call history with message controller
    - Modify `controllers/messageController.js` to include call history
    - Load call history when loading conversations
    - Mark missed calls as seen when conversation is viewed
    - _Requirements: 17.5, 16.2_
  
  - [ ]* 11.5 Write property test for missed call indicator clearing
    - **Property 38: Missed Call Indicator Clearing**
    - **Validates: Requirements 17.5**
  
  - [ ] 11.5 Implement optional call summary messages
    - Add option to insert call summary into conversation
    - Display call duration and outcome in message
    - Maintain messaging interface state during calls
    - _Requirements: 16.4, 16.5_
  
  - [ ]* 11.6 Write property test for messaging state preservation
    - **Property 36: Messaging State Preservation**
    - **Validates: Requirements 16.5**

- [ ] 12. Implement mobile-specific features
  - [ ] 12.1 Add mobile camera switching
    - Detect mobile device in WebRTCManager
    - Implement camera switch button in CallUI
    - Handle front/rear camera toggle
    - _Requirements: 7.5, 15.1_
  
  - [ ]* 12.2 Write property test for mobile camera switch
    - **Property 18: Mobile Camera Switch**
    - **Validates: Requirements 7.5**
  
  - [ ] 12.2 Implement screen wake lock
    - Request wake lock when call becomes active
    - Release wake lock when call ends
    - Handle wake lock errors gracefully
    - _Requirements: 15.2_
  
  - [ ]* 12.3 Write property test for mobile wake lock
    - **Property 32: Mobile Wake Lock**
    - **Validates: Requirements 15.2**
  
  - [ ] 12.3 Handle mobile browser backgrounding
    - Detect when browser is backgrounded
    - Maintain connection if possible
    - Notify other participant if call is terminated
    - _Requirements: 15.4, 15.5_
  
  - [ ] 12.4 Optimize mobile UI layout
    - Make call interface responsive for mobile screens
    - Adjust video display for mobile aspect ratios
    - Ensure touch-friendly button sizes
    - _Requirements: 15.3_

- [ ] 13. Implement permission management
  - [ ] 13.1 Add permission explanation dialogs
    - Display explanatory message before requesting permissions
    - Explain why camera/microphone access is needed
    - _Requirements: 12.1_
  
  - [ ]* 13.2 Write property test for permission request explanation
    - **Property 27: Permission Request Explanation**
    - **Validates: Requirements 12.1**
  
  - [ ] 13.2 Implement permission verification
    - Check permissions before each call attempt
    - Detect browser-level permission blocks
    - Cache permission state to avoid repeated prompts
    - _Requirements: 12.3, 12.4, 12.5_
  
  - [ ]* 13.3 Write property test for permission verification
    - **Property 29: Permission Verification**
    - **Validates: Requirements 12.5**
  
  - [ ] 13.3 Add permission troubleshooting guidance
    - Display instructions for enabling permissions in browser settings
    - Provide browser-specific guidance
    - _Requirements: 12.2, 12.3_

- [ ] 14. Implement quality optimization
  - [ ] 14.1 Configure adaptive bitrate
    - Implement automatic audio bitrate adjustment
    - Implement automatic video resolution adjustment
    - Prioritize audio quality over video when bandwidth is limited
    - _Requirements: 14.1, 14.2, 14.3_
  
  - [ ] 14.2 Add network quality monitoring
    - Monitor connection statistics
    - Calculate network quality score
    - Display poor connection warning when quality drops
    - Update network quality indicator in UI
    - _Requirements: 9.5, 6.5_
  
  - [ ]* 14.3 Write property test for network quality warning
    - **Property 22: Network Quality Warning**
    - **Validates: Requirements 9.5**
  
  - [ ] 14.3 Verify audio processing configuration
    - Ensure echo cancellation is enabled
    - Ensure noise suppression is enabled
    - Ensure auto gain control is enabled
    - _Requirements: 14.4, 14.5_

- [ ] 15. Checkpoint - Ensure integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. Implement security measures
  - [ ] 16.1 Add authentication checks
    - Verify user authentication before call initiation
    - Verify authentication in signaling server
    - Reject unauthenticated requests
    - _Requirements: 13.2_
  
  - [ ]* 16.2 Write property test for authentication requirement
    - **Property 30: Authentication Requirement**
    - **Validates: Requirements 13.2**
  
  - [ ] 16.2 Implement authorization validation
    - Validate both participants are authorized to communicate
    - Check authorization in signaling server before forwarding messages
    - Prevent unauthorized users from joining calls
    - _Requirements: 13.3, 13.4_
  
  - [ ] 16.3 Verify encryption configuration
    - Verify WebRTC uses DTLS-SRTP encryption
    - Verify Socket.io uses WSS in production
    - Document security configuration
    - _Requirements: 13.1, 13.5_
  
  - [ ] 16.4 Implement call history privacy
    - Ensure call history is only accessible to participants
    - Anonymize user data in aggregate analytics
    - Verify admin-only access to analytics
    - _Requirements: 18.5_

- [ ] 17. Add error logging and monitoring
  - [ ] 17.1 Implement comprehensive error logging
    - Log all errors with timestamp, user ID, call ID
    - Log error codes and messages
    - Log browser and device information
    - Include stack traces for unexpected errors
    - _Requirements: 1.5, 9.4, 11.3_
  
  - [ ] 17.2 Add call analytics tracking
    - Track total calls, average duration, success rate
    - Track call failures by error type
    - Track peak usage times
    - Record concurrent call counts
    - _Requirements: 18.1, 18.3, 18.4_
  
  - [ ]* 17.3 Write property test for call analytics aggregation
    - **Property 39: Call Analytics Aggregation**
    - **Validates: Requirements 18.1, 18.3, 18.5**

- [ ] 18. Final integration and testing
  - [ ] 18.1 Run complete end-to-end test suite
    - Test complete call flow from initiation to termination
    - Test all error scenarios
    - Test mobile-specific features
    - Test permission flows
    - _Requirements: All_
  
  - [ ] 18.2 Perform cross-browser testing
    - Test on Chrome, Firefox, Safari, Edge
    - Test on mobile browsers (iOS Safari, Chrome Mobile)
    - Document any browser-specific issues
    - _Requirements: 15.1_
  
  - [ ] 18.3 Verify security requirements
    - Run security test checklist
    - Verify HTTPS and WSS configuration
    - Test authentication and authorization
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_
  
  - [ ] 18.4 Performance and load testing
    - Test connection establishment time
    - Test signaling latency
    - Test with multiple concurrent calls
    - Monitor memory and CPU usage
    - _Requirements: 4.4, 8.5_

- [ ] 19. Final checkpoint - Production readiness
  - Ensure all tests pass, verify deployment checklist, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties across randomized inputs
- Unit tests validate specific examples, edge cases, and integration points
- The implementation uses JavaScript throughout, matching the design document
- WebRTC requires HTTPS in production - ensure SSL is configured before deployment
- Socket.io signaling server can be scaled horizontally using Redis adapter if needed
