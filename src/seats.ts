// Stable clockwise seat order, starting immediately after the human at the bottom.
// The dealer will rotate through seat IDs; it must never rename or reorder players.
export const layouts: Record<number, readonly (readonly [number, number])[]> = {
 1: [[50, 9]],
 2: [[27, 9], [73, 9]],
 3: [[16, 9], [50, 9], [84, 9]],
 4: [[10, 55], [27, 9], [73, 9], [90, 55]],
 5: [[10, 70], [10, 34], [50, 9], [90, 34], [90, 70]],
 6: [[10, 72], [10, 38], [27, 9], [73, 9], [90, 38], [90, 72]],
 7: [[10, 72], [10, 38], [16, 9], [50, 9], [84, 9], [90, 38], [90, 72]],
 8: [[10, 76], [10, 53], [10, 30], [32, 9], [68, 9], [90, 30], [90, 53], [90, 76]],
};
