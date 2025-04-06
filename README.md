# Whatever WebGPU

This is a test project that follows step-by-step the guide from [Your First WebGPU App](https://codelabs.developers.google.com/your-first-webgpu-app) for an almost identical result, with some additional features. It was created as a learning exercise to explore and understand the WebGPU API.

## Features

- **GPU-Accelerated Simulation**: The Game of Life simulation is computed entirely on the GPU using compute shaders.
- **Interactive Controls**: Modify simulation parameters such as interval and grid size, and reset the grid state.

## Demo

Check out the live demo here: [https://whatever-web-gpu.vercel.app/](https://whatever-web-gpu.vercel.app/)

## Getting Started

### Prerequisites

- A browser with WebGPU support (e.g., the latest version of Chrome or Edge).
- `Node.js` and `pnpm` installed on your system.

### Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/Floriansylvain/whatever-webgpu.git
   cd whatever-webgpu
   ```

2. Install dependencies:
   ```sh
   pnpm install
   ```

3. Start the development server:
   ```sh
   pnpm run dev
   ```

4. Open your browser and navigate to `http://localhost:5173`.

## Usage

- Use the **Simulation Interval** slider to adjust the time between compute updates.
- Use the **Grid Size** slider to change the size of the simulation grid.
- Click the **Reset Grid** button to randomize the grid state.
