// utils/downsample.js

/**
 * Downsample a data array using the Largest-Triangle-Three-Buckets (LTTB) algorithm.
 * Preserves visual fidelity of the chart shape better than naive every-Nth-point sampling.
 *
 * @param {Array<Object>} data     - Array of data points (must have a numeric 'date' or 'ts' key)
 * @param {number}        maxPoints - Maximum output size (default 500)
 * @param {string}        valueKey  - Key name(s) to consider for triangle area (uses first fund key by default)
 * @returns {Array<Object>}        - Downsampled array
 */
export function downsampleLTTB(data, maxPoints = 500, valueKey = null) {
  if (!data || data.length <= maxPoints) return data;

  // Auto-detect a numeric value key if not provided
  if (!valueKey) {
    const sampleKeys = Object.keys(data[0] || {}).filter(
      (k) => k !== "date" && typeof data[0][k] === "number",
    );
    valueKey = sampleKeys[0] || null;
    if (!valueKey) return data; // No numeric series — skip downsampling
  }

  const sampled = [data[0]]; // Always keep first point
  const bucketSize = (data.length - 2) / (maxPoints - 2);

  let prevIndex = 0;

  for (let i = 1; i < maxPoints - 1; i++) {
    // Calculate bucket boundaries
    const bucketStart = Math.floor((i - 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor(i * bucketSize) + 1, data.length - 1);
    const nextBucketStart = Math.floor(i * bucketSize) + 1;
    const nextBucketEnd = Math.min(
      Math.floor((i + 1) * bucketSize) + 1,
      data.length - 1,
    );

    // Calculate average of next bucket (for the triangle)
    let avgX = 0;
    let avgY = 0;
    let nextCount = 0;
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgX += j;
      avgY += data[j][valueKey] || 0;
      nextCount++;
    }
    if (nextCount > 0) {
      avgX /= nextCount;
      avgY /= nextCount;
    }

    // Pick the point in current bucket with the largest triangle area
    let maxArea = -1;
    let bestIndex = bucketStart;

    const pointAX = prevIndex;
    const pointAY = data[prevIndex][valueKey] || 0;

    for (let j = bucketStart; j < bucketEnd; j++) {
      const area = Math.abs(
        (pointAX - avgX) * ((data[j][valueKey] || 0) - pointAY) -
          (pointAX - j) * (avgY - pointAY),
      );
      if (area > maxArea) {
        maxArea = area;
        bestIndex = j;
      }
    }

    sampled.push(data[bestIndex]);
    prevIndex = bestIndex;
  }

  sampled.push(data[data.length - 1]); // Always keep last point
  return sampled;
}
