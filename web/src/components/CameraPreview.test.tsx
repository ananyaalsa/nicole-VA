import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CameraPreview } from './CameraPreview';

describe('CameraPreview', () => {
  it('renders the preview with a "watching" indicator', () => {
    render(<CameraPreview stream={null} />);
    expect(screen.getByTestId('camera-preview')).toBeInTheDocument();
    expect(screen.getByText(/watching/i)).toBeInTheDocument();
  });

  it('fires onFlip and onClose', () => {
    const onFlip = vi.fn();
    const onClose = vi.fn();
    render(<CameraPreview stream={null} onFlip={onFlip} onClose={onClose} />);
    fireEvent.click(screen.getByTitle(/flip/i));
    fireEvent.click(screen.getByTitle(/turn off/i));
    expect(onFlip).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
