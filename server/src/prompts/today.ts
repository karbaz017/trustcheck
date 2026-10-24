/**
 * The model's training data ends before "now", so without the real date it treats recent past events
 * (e.g. "X acquired Y in 2026") as forecasts. Every prompt that reasons about time gets this line.
 */
export const todayLine = (now = new Date()) =>
  `Today's date is ${now.toISOString().slice(0, 10)}. Your own knowledge may be out of date: anything dated on or before today is past or present, even if you don't recognise it.`;
