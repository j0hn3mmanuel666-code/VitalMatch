# Implementation Plan

- [ ] 1. Enhance navigation header with VitalMatch branding and menu
  - Update `views/partials/head.xian` to include VitalMatch logo/brand
  - Add navigation menu with links: Home, About, Request Blood, Become a Donor, Login
  - Implement responsive mobile menu structure with Tailwind classes
  - Add sticky positioning and shadow styling
  - _Requirements: 5.1, 5.2, 5.4_

- [ ] 2. Create hero section with gradient background and primary CTAs
  - Implement full-height hero section in `views/home.xian`
  - Add red-to-blue gradient background using Tailwind gradient classes
  - Create headline: "Save Lives Through Smart Blood Coordination"
  - Add subheadline mentioning Philippine Red Cross and platform functionality
  - Implement two primary CTA buttons: "Request Blood Now" and "Become a Donor"
  - Add inline SVG blood drop or medical cross icon
  - Ensure white text for contrast against gradient
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 3.1, 3.2_

- [ ] 3. Build features section with four feature cards
  - Create features section container with light gray background
  - Implement responsive grid layout (1 column mobile, 2 tablet, 4 desktop)
  - _Requirements: 4.1_

- [ ] 3.1 Create feature card component structure
  - Design reusable card structure with icon, title, and description
  - Add white background, shadow, and border styling
  - Implement hover effects (elevation and red border)
  - _Requirements: 4.6_

- [ ] 3.2 Add Real-Time Blood Requests feature card
  - Create inline SVG clock/alert icon
  - Add title: "Real-Time Blood Requests"
  - Add description about hospitals posting urgent needs
  - _Requirements: 4.2_

- [ ] 3.3 Add Smart Matching Algorithm feature card
  - Create inline SVG network/connection icon
  - Add title: "Smart Matching Algorithm"
  - Add description about automated filtering
  - _Requirements: 4.3_

- [ ] 3.4 Add Instant Notifications feature card
  - Create inline SVG bell/notification icon
  - Add title: "Instant Notifications"
  - Add description about donor alerts
  - _Requirements: 4.4_

- [ ] 3.5 Add Location-Based Services feature card
  - Create inline SVG map pin icon
  - Add title: "Location-Based Services"
  - Add description about geographic proximity matching
  - _Requirements: 4.5_

- [ ] 4. Create secondary CTA section
  - Add centered section with headline "Ready to Make a Difference?"
  - Include same two CTA buttons as hero section
  - Use white or light blue background
  - Add motivational messaging for donor participation
  - _Requirements: 3.3_

- [ ] 5. Update footer with VitalMatch information
  - Enhance `views/partials/footer.xian` with Philippine Red Cross partnership mention
  - Add links for Privacy Policy, Terms of Service, Contact (placeholder routes)
  - Maintain XianFire framework attribution
  - _Requirements: 6.2_

- [ ] 6. Ensure route configuration for landing page
  - Verify root route "/" renders the updated home.xian template
  - Ensure page title is set to "VitalMatch - Smart Blood Request Platform"
  - _Requirements: 1.1_

- [ ]* 7. Write example-based tests for landing page content
  - Set up testing framework with Cheerio for HTML parsing
  - _Requirements: All_

- [ ]* 7.1 Write tests for hero section
  - Test hero section exists
  - Test headline text is present
  - Test tagline mentions blood request and donor matching
  - Test Philippine Red Cross is mentioned
  - Test gradient classes are applied
  - Test both CTA buttons exist with correct text
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 3.1_

- [ ]* 7.2 Write tests for features section
  - Test features section exists
  - Test four feature cards are present
  - Test each feature card has an icon element
  - Test "Real-Time Blood Requests" content is present
  - Test "Smart Matching Algorithm" content is present
  - Test "Instant Notifications" content is present
  - Test "Location-Based Services" content is present
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ]* 7.3 Write tests for navigation
  - Test navigation menu exists
  - Test Home link is present
  - Test About link is present
  - Test Request Blood link is present
  - Test Become a Donor link is present
  - Test Login link is present
  - _Requirements: 5.1, 5.2, 5.4_

- [ ]* 7.4 Write tests for CTA links
  - Test "Request Blood" CTA has correct href attribute
  - Test "Become a Donor" CTA has correct href attribute
  - Test CTAs have contrasting color classes
  - _Requirements: 2.2, 3.2_

- [ ]* 7.5 Write tests for footer content
  - Test footer exists
  - Test Philippine Red Cross partnership is mentioned
  - _Requirements: 6.2_

- [ ] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
