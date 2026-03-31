const express = require('express');
const router = express.Router();
const axios = require('axios');

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;

router.get('/visitors', async (req, res) => {
  try {
    const response = await axios.get(
      `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/analytics/dashboard`,
      {
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
        },
      }
    );
    // Keep a count-style payload shape aligned with the active backend route.
    const count = response.data.result.totals.uniques.today;
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch total visitors' });
  }
});

module.exports = router;
