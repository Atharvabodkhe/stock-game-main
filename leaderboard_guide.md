# Game Results Leaderboard Guide

This document explains the enhancements made to the "View Results" feature in the Admin Dashboard's completed rooms section.

## What's New

When you click "View Results" for a completed room, you'll now see:

1. **Profit-Based Leaderboard**: Players are ranked by their final balance, with profit percentages clearly displayed
2. **Enhanced Player Reports**: Each player's performance summary shows:
   - Final balance (dollar amount)
   - Profit/loss percentage
   - Color-coded indicators (green for profit, red for loss)
   - Detailed personality analysis

## How It Works

The leaderboard is automatically generated when you click "View Results" for any completed room. The system:

1. Fetches all game results data for the selected room
2. Calculates profit percentages based on the starting balance of $10,000
3. Sorts players by final balance (highest to lowest)
4. Assigns ranks (#1, #2, #3, etc.)
5. Displays detailed performance metrics

## Using the Leaderboard

1. Go to the Admin Dashboard
2. Scroll down to the "Completed Rooms" section
3. Click "Show Completed Rooms" to view all completed game rooms
4. Find the room you want to analyze and click "View Results"
5. The leaderboard will appear showing all players ranked by performance
6. Click "Report" next to any player to view their detailed trading analysis

## Technical Details

This enhancement was implemented without changing any existing functionality:

1. Enhanced the `loadResults` function to calculate profit percentages
2. Added a `getProfit` helper function to safely handle profit display
3. Improved the UI to show color-coded performance indicators
4. Added more detailed reporting with performance summaries

These changes make it easier to analyze game outcomes and understand player performance at a glance. 