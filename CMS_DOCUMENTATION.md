# VitalMatch Public CMS Documentation

## Overview

The **Public Content Management System (CMS)** is a lightweight, built-in solution for managing public-facing content on your VitalMatch landing page. It allows administrators to edit page sections without touching the code.

## Features

### 🎯 Key Features
- **Database-Driven Content**: All public content stored in MySQL via Sequelize ORM
- **Admin Panel**: User-friendly interface at `/admin/cms`
- **Section Management**: Create, read, update, and delete content sections
- **Dynamic Home Page**: Homepage content loaded from database
- **API Access**: Public REST API for accessing content
- **Version Control**: Timestamps track when content was last updated
- **Active/Inactive Status**: Toggle sections on/off without deleting

## Architecture

### Database Table: `public_content`

```sql
- id (PRIMARY KEY)
- section (UNIQUE) - Section identifier (e.g., "hero", "callForDonation")
- title - Main heading
- subtitle - Secondary heading
- description - Section body content
- primaryButtonText - CTA button text
- primaryButtonLink - CTA button link
- secondaryButtonText - Secondary button text
- secondaryButtonLink - Secondary button link
- imageUrl - Optional section image
- isActive - Boolean to show/hide section
- metadata - JSON field for custom data
- createdAt - Timestamp
- updatedAt - Timestamp
```

### Components Created

#### 1. **Model** (`models/publicContentModel.js`)
- Sequelize model definition
- Handles schema and validation
- Supports JSON metadata for extensibility

#### 2. **Controller** (`controllers/publicContentController.js`)
- `getAllPublicContent()` - Get all active sections (API)
- `getPublicContentBySection()` - Get specific section (API)
- `createPublicContent()` - Create new section (Admin)
- `updatePublicContent()` - Edit section (Admin)
- `deletePublicContent()` - Soft-delete section (Admin)
- `adminPublicContentPage()` - Render admin panel

#### 3. **Routes** (`routes/index.js`)

**Public API Routes:**
```
GET /api/public-content                    - Get all content
GET /api/public-content/:section           - Get specific section
```

**Admin Routes:**
```
GET /admin/cms                             - Admin CMS panel
POST /api/admin/public-content             - Create section
PUT /api/admin/public-content/:section     - Update section
DELETE /api/admin/public-content/:section  - Delete section
```

#### 4. **Views**
- `views/admin-public-cms.xian` - Admin management interface
- Updated `views/home.xian` - To use dynamic content

## Setup & Migration

### Step 1: Run Migration
```bash
node migratePublicContent.js
```

This will:
- Create the `public_content` table
- Seed default sections (hero, callForDonation, about)
- Initialize the database structure

### Step 2: Access Admin Panel
Navigate to: `http://localhost:3000/admin/cms`

## Usage

### For Administrators

1. **Edit Existing Sections**
   - Go to `/admin/cms`
   - Click on any tab (Hero, Call for Donation, etc.)
   - Edit fields like title, description, button links
   - Click "Save Changes"

2. **Create New Section**
   - Scroll to "Add New Content Section"
   - Enter section name (e.g., "testimonials")
   - Fill in title and description
   - Click "Create Section"

3. **Activate/Deactivate**
   - Check/uncheck "Active" checkbox
   - Save changes to show/hide from public

### For Developers

#### Access Content Programmatically

```javascript
// In your controller
import { PublicContent } from "../models/publicContentModel.js";

const heroContent = await PublicContent.findOne({
  where: { section: 'hero', isActive: true }
});

console.log(heroContent.title);
console.log(heroContent.description);
```

#### Access via API

```javascript
// Public API - no authentication needed
fetch('/api/public-content')
  .then(res => res.json())
  .then(data => console.log(data));

// Get specific section
fetch('/api/public-content/hero')
  .then(res => res.json())
  .then(data => console.log(data.data));
```

#### Update Content via API

```javascript
// Admin API - requires admin authentication
const updateData = {
  title: "Updated Title",
  description: "Updated description text",
  primaryButtonText: "New Button Text",
  primaryButtonLink: "/new-link",
  isActive: true
};

fetch('/api/admin/public-content/hero', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(updateData)
})
.then(res => res.json())
.then(data => console.log(data));
```

## Content Sections

### Default Sections (Pre-seeded)

#### 1. **hero**
- Main landing page hero section
- Title, subtitle, two CTA buttons
- Ideal for: Main value proposition

#### 2. **callForDonation**
- Blood donation call section
- Description and CTA button
- Ideal for: Blood drive announcements

#### 3. **about**
- About platform section
- Can be used for mission statement
- Ideal for: Company/platform description

### Creating Custom Sections

You can create any section name. Examples:
- `testimonials` - User testimonials
- `benefits` - Key benefits  
- `features` - Platform features
- `faq` - Frequently asked questions
- `news` - Latest updates

## Template Integration

### In Your Handlebars Views

```handlebars
<!-- Access in your view -->
{{#if content.hero}}
  <h1>{{content.hero.title}}</h1>
  <p>{{content.hero.description}}</p>
  <a href="{{content.hero.primaryButtonLink}}">
    {{content.hero.primaryButtonText}}
  </a>
{{/if}}
```

## Advanced Features

### Metadata Field

Store additional JSON data for complex sections:

```javascript
{
  "section": "testimonials",
  "title": "What Users Say",
  "description": "Customer testimonials",
  "metadata": {
    "displayFormat": "carousel",
    "itemsPerPage": 5,
    "autoplay": true,
    "interval": 3000
  }
}
```

## Security

- ✅ Admin routes protected with `isAdmin` middleware
- ✅ Input validation on all endpoints
- ✅ CSRF protection enabled
- ✅ Rate limiting on API endpoints
- ✅ Soft deletes (no permanent data loss)

## Performance

- ✅ All public endpoints cached (60 seconds)
- ✅ Query optimization with database indexing
- ✅ Lightweight JSON responses
- ✅ Minimal database impact

## Troubleshooting

### Table Not Found Error
```bash
# Re-run migration
node migratePublicContent.js
```

### Content Not Showing
1. Check if section `isActive = true`
2. Verify section name matches exactly (case-sensitive)
3. Check database: `SELECT * FROM public_content WHERE section='hero';`

### Admin Panel Not Accessible
1. Ensure you're logged in as admin
2. Check user role: `SELECT role FROM users WHERE id=YOUR_ID;`

## Future Enhancements

Possible additions:
- Image upload to server instead of URLs
- Version history/rollback
- Content scheduling (publish at specific time)
- Translation/multi-language support
- SEO meta tags management
- A/B testing variants
- Content approval workflow

## Files Modified/Created

```
models/
  ├── publicContentModel.js (NEW)
controllers/
  ├── publicContentController.js (NEW)
  └── homeController.js (UPDATED)
routes/
  └── index.js (UPDATED - added CMS routes)
views/
  ├── admin-public-cms.xian (NEW)
  └── home.xian (READY for updates)
migratePublicContent.js (NEW - migration script)
```

## Support

For issues or questions, refer to:
- Database logs in MySQL
- Application console for errors
- Admin panel validation messages

---

**Last Updated**: July 2026
**Version**: 1.0
**License**: MIT
