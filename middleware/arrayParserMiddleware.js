module.exports = (req, res, next) => {
    // Parse product array if it exists and is a string
    if (req.body.product && typeof req.body.product === 'string') {
      try {
        req.body.product = req.body.product.split(',')
      } catch (e) {
        return res.status(400).json({ error: "Invalid product array format" });
      }
    }
    next();
  };