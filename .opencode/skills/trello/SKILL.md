---
name: trello
description: Use when the user asks to manage Trello boards, lists, cards, or comments. Integrates with the Trello MCP server to provide full Trello API access.
---

# Trello Skill

This skill provides integration with Trello via the MCP server `@delorenj/mcp-server-trello`.

## Configuration

The Trello MCP server is configured in `opencode.json` and requires these environment variables:
- `TRELLO_API_KEY`
- `TRELLO_TOKEN`

Get your API key and token at: https://trello.com/power-ups/admin

## Available Tools

The MCP server provides these tools:

### Board Tools
- `list_boards` - List all boards
- `list_boards_in_workspace` - List boards in a workspace
- `set_active_board` - Set default board
- `get_active_board_info` - Show current board

### List Tools
- `get_lists` - Get lists in a board
- `add_list_to_board` - Create a new list
- `archive_list` - Archive a list
- `update_list_position` - Reorder a list

### Card Tools
- `get_cards_by_list_id` - Get cards in a list
- `get_card` - Get full card details (checklists, attachments, labels, members, comments)
- `add_card_to_list` - Create a card
- `update_card_details` - Update card fields
- `move_card` - Move card between lists
- `archive_card` - Archive a card
- `get_my_cards` - Get cards assigned to you

### Checklist Tools
- `get_checklist_items` - Get items from a checklist
- `add_checklist_item` - Add item to checklist
- `update_checklist_item` - Update checklist item
- `delete_checklist_item` - Remove checklist item
- `get_acceptance_criteria` - Get "Acceptance Criteria" checklist

### Comment & Attachment Tools
- `add_comment` - Comment on a card
- `update_comment` - Edit a comment
- `delete_comment` - Remove a comment
- `get_card_comments` - Get card comments
- `attach_image_to_card` - Attach image from URL
- `attach_file_to_card` - Attach any file from URL or local path

### Workspace Tools
- `list_workspaces` - List workspaces
- `set_active_workspace` - Set default workspace

## Workflow

1. Start with `list_boards` to see available boards
2. Use `set_active_board` to choose one
3. Use `get_lists` to see lists in the board
4. Use `get_cards_by_list_id` to see cards in a list
5. Use `get_card` for full card details

## MomAI Desktop Board

This repo's Trello skill is configured to work with the **MomAI Desktop** board by default.
The credentials and default board ID are stored in `apps/momai/.env`.
