import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UnknownProductsPromptModal } from './UnknownProductsPromptModal';

describe('UnknownProductsPromptModal', () => {
  const mockUnknownProducts = [
    {
      productNumber: '4310999',
      orderSku: 'SKU-999',
      description: 'Andrex Quilts Special Edition',
      rowCount: 5
    },
    {
      productNumber: '4310888',
      orderSku: 'SKU-888',
      description: 'Andrex Classic Clean 4pk',
      rowCount: 3
    }
  ];

  it('renders unknown products prompt and asks the user to add them', () => {
    const onConfirmAdd = vi.fn();
    const onClose = vi.fn();

    render(
      <UnknownProductsPromptModal
        isOpen={true}
        onClose={onClose}
        onConfirmAdd={onConfirmAdd}
        unknownProducts={mockUnknownProducts}
      />
    );

    expect(screen.getByText('Unknown Products Detected')).toBeInTheDocument();
    expect(screen.getByText('4310999')).toBeInTheDocument();
    expect(screen.getByText('Andrex Quilts Special Edition')).toBeInTheDocument();
    expect(screen.getByText('4310888')).toBeInTheDocument();
    expect(screen.getByText(/Would you like to add them to the Product Master now\?/i)).toBeInTheDocument();

    // Clicking "Yes, Add to Product Master"
    const yesButton = screen.getByRole('button', { name: /Yes, Add to Product Master/i });
    fireEvent.click(yesButton);
    expect(onConfirmAdd).toHaveBeenCalledTimes(1);

    // Clicking "No, Review Report First"
    const noButton = screen.getByRole('button', { name: /No, Review Report First/i });
    fireEvent.click(noButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
