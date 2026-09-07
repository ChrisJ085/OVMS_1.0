import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { EnvironmentModeProvider, useEnvironmentMode } from './EnvironmentModeContext';

const TestModeConsumer: React.FC = () => {
  const { mode, isDevelopmentMode, isProductionMode, setMode, toggleMode } = useEnvironmentMode();

  return (
    <div>
      <div data-testid="mode-val">{mode}</div>
      <div data-testid="is-dev">{isDevelopmentMode ? 'YES' : 'NO'}</div>
      <div data-testid="is-prod">{isProductionMode ? 'YES' : 'NO'}</div>
      <button data-testid="toggle-btn" onClick={toggleMode}>
        Toggle
      </button>
      <button data-testid="set-prod-btn" onClick={() => setMode('PRODUCTION')}>
        Set Prod
      </button>
      <button data-testid="set-dev-btn" onClick={() => setMode('DEVELOPMENT')}>
        Set Dev
      </button>
    </div>
  );
};

describe('EnvironmentModeContext Test Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to stored value or fallback when initialized', () => {
    render(
      <EnvironmentModeProvider defaultMode="DEVELOPMENT">
        <TestModeConsumer />
      </EnvironmentModeProvider>
    );

    expect(screen.getByTestId('mode-val').textContent).toBe('DEVELOPMENT');
    expect(screen.getByTestId('is-dev').textContent).toBe('YES');
    expect(screen.getByTestId('is-prod').textContent).toBe('NO');
  });

  it('allows toggling between DEVELOPMENT and PRODUCTION', () => {
    render(
      <EnvironmentModeProvider defaultMode="DEVELOPMENT">
        <TestModeConsumer />
      </EnvironmentModeProvider>
    );

    expect(screen.getByTestId('mode-val').textContent).toBe('DEVELOPMENT');

    act(() => {
      screen.getByTestId('toggle-btn').click();
    });

    expect(screen.getByTestId('mode-val').textContent).toBe('PRODUCTION');
    expect(screen.getByTestId('is-dev').textContent).toBe('NO');
    expect(screen.getByTestId('is-prod').textContent).toBe('YES');
    expect(localStorage.getItem('ovms_app_environment_mode')).toBe('PRODUCTION');

    act(() => {
      screen.getByTestId('toggle-btn').click();
    });

    expect(screen.getByTestId('mode-val').textContent).toBe('DEVELOPMENT');
    expect(screen.getByTestId('is-dev').textContent).toBe('YES');
    expect(screen.getByTestId('is-prod').textContent).toBe('NO');
    expect(localStorage.getItem('ovms_app_environment_mode')).toBe('DEVELOPMENT');
  });

  it('allows setting explicit mode and persists to localStorage', () => {
    render(
      <EnvironmentModeProvider defaultMode="DEVELOPMENT">
        <TestModeConsumer />
      </EnvironmentModeProvider>
    );

    act(() => {
      screen.getByTestId('set-prod-btn').click();
    });

    expect(screen.getByTestId('mode-val').textContent).toBe('PRODUCTION');
    expect(localStorage.getItem('ovms_app_environment_mode')).toBe('PRODUCTION');

    act(() => {
      screen.getByTestId('set-dev-btn').click();
    });

    expect(screen.getByTestId('mode-val').textContent).toBe('DEVELOPMENT');
    expect(localStorage.getItem('ovms_app_environment_mode')).toBe('DEVELOPMENT');
  });

  it('reads initial mode from localStorage if present', () => {
    localStorage.setItem('ovms_app_environment_mode', 'PRODUCTION');

    render(
      <EnvironmentModeProvider defaultMode="DEVELOPMENT">
        <TestModeConsumer />
      </EnvironmentModeProvider>
    );

    expect(screen.getByTestId('mode-val').textContent).toBe('PRODUCTION');
    expect(screen.getByTestId('is-prod').textContent).toBe('YES');
  });
});
