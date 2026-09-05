import express from 'express';
import { groupQueries } from '../models';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = express.Router();

router.use(authMiddleware);

// Get all groups for user
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const groups = await groupQueries.findByUserId(userId);
    res.json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Create a new group
router.post('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { name } = req.body;
    
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const group = await groupQueries.create(userId, name);
    res.status(201).json(group);
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Update group name
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const id = parseInt(req.params.id);
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const group = await groupQueries.update(id, userId, name);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json(group);
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// Reorder groups
router.post('/reorder', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupIds } = req.body;

    if (!Array.isArray(groupIds)) {
      return res.status(400).json({ error: 'groupIds array is required' });
    }

    await groupQueries.updateOrders(userId, groupIds);
    res.json({ message: 'Groups reordered successfully' });
  } catch (error) {
    console.error('Error reordering groups:', error);
    res.status(500).json({ error: 'Failed to reorder groups' });
  }
});

// Delete group
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const id = parseInt(req.params.id);

    const success = await groupQueries.delete(id, userId);
    if (!success) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

export default router;
