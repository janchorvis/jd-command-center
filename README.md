# Jacob's Command Center

Personal task & deal management dashboard - separate from the team-facing Anchor Dashboard.

## What's Live

### Home Page (`/`)
- Overview stats: overdue tasks, this week, active deals, stale deals
- Alert banners for overdue tasks and stale deals
- Quick links to Tasks and Deals pages

### Tasks Page (`/tasks`)
- **Kanban board** with 5 columns:
  - 🔴 Overdue
  - 🟡 This Week (next 7 days)
  - 🔵 Next Week (8-14 days)
  - 🟢 Later (15+ days)
  - 📦 Parked (no due date)
- Task cards show:
  - Task name
  - Due date with countdown
  - Project tag
  - Notes preview
  - Quick complete button
- Color-coded health indicators:
  - Red border = overdue
  - Yellow border = due in 3 days or less
  - Gray border = normal

### Deals Page (`/deals`)
- Leasing pipeline from Pipedrive (pipeline ID 4 only)
- Deal cards grouped by stage
- Health tracking:
  - 🟢 Active (touched in last 7 days)
  - 🟡 Watch (7-14 days)
  - 🔴 Stale (14+ days)
- Stale deals alert section

## Tech Stack
- **Next.js 15** (App Router, React Server Components)
- **TypeScript**
- **Tailwind CSS** (dark theme)
- **Recharts** (for future charts)
- **Heroicons** (UI icons)
- **date-fns** (date formatting)

## Data Sources
- **Asana**: All incomplete tasks assigned to Jacob
- **Pipedrive**: All open deals in Leasing pipeline (id: 4)

## Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

Already configured in `.env.local`:
- `ASANA_TOKEN` - Asana Personal Access Token
- `ASANA_WORKSPACE_GID` - Anchor Investments workspace
- `ASANA_USER_GID` - Jacob's user ID
- `PIPEDRIVE_API_TOKEN` - Pipedrive API token
- `PIPEDRIVE_DOMAIN` - anchorinvestments3.pipedrive.com
- `PIPEDRIVE_LEASING_PIPELINE_ID` - Pipeline 4 (Leasing)

## What's Next (Not Built Yet)

### Phase 2: Interactivity
- [ ] Click task card to expand full details
- [ ] Mark tasks complete (currently shows button but doesn't work)
- [ ] Drag-and-drop to change due dates
- [ ] Quick edit task due date
- [ ] Add new task from dashboard
- [ ] Update deal notes from dashboard

### Phase 3: Unified Command Dashboard (`/command`)
- [ ] "What needs attention NOW" view
- [ ] Top 3 tasks auto-selected
- [ ] Deals needing action today
- [ ] 7-day timeline view (tasks + deal milestones)
- [ ] Pull in debt maturity + CapEx from property dashboard

### Phase 4: Visualizations
- [ ] Task completion trends (line chart)
- [ ] Deal funnel chart
- [ ] Pipeline velocity tracking
- [ ] Time-in-stage for deals

## Deployment

### Option 1: Vercel (Recommended)
1. Push to GitHub
2. Import in Vercel
3. Add environment variables
4. Deploy
5. Optional: password-protect the site

### Option 2: Local Only
Just run `npm run dev` when you need it.

### Option 3: Self-host
Deploy to a VPS with Node.js + PM2 for always-on access.

## Current Status

**✅ Working:**
- Home page with stats
- Tasks kanban view (read-only)
- Deals pipeline view (read-only)
- Asana API integration
- Pipedrive API integration
- Dark theme UI
- Responsive layout

**🚧 In Progress:**
- Task completion actions (needs API route)
- Task detail modal
- Deal update form

**📋 Planned:**
- Drag-and-drop task reordering
- Unified command center page
- Chart visualizations
- Mobile optimization

---

**Access**: http://localhost:3000 (dev server running in background)
