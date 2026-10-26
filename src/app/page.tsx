'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, BarChart, Lock, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

function QAERibbonLogo({ size = 140, className = '' }: { size?: number; className?: string }) {
  const height = Math.round(size * (89 / 88));
  return (
    <svg
      width={size}
      height={height}
      viewBox="12 13 88 89"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="QAE Studio Ribbon Logo"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        {/* Main Ribbon Body: Deep Plum to Rich Mauve (Forms Q Loop & E Spine/Tiers) */}
        <linearGradient id="qae_ribbon_main" x1="20" y1="15" x2="70" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#9E6983" />
          <stop offset="50%" stopColor="#73445C" />
          <stop offset="100%" stopColor="#4F2B3E" />
        </linearGradient>

        {/* Right Ribbon Leg: Mauve to Deep Plum (Forms the Apex and Right Leg of A) */}
        <linearGradient id="qae_ribbon_leg" x1="45" y1="15" x2="105" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#B27F99" />
          <stop offset="60%" stopColor="#895571" />
          <stop offset="100%" stopColor="#5E334B" />
        </linearGradient>

        {/* Option 1 Signature Folded Ribbon: Luminous Lavender-Pink to Rose Mauve (Q Tail & Base Accent) */}
        <linearGradient id="qae_ribbon_fold" x1="30" y1="60" x2="85" y2="95" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#EDB8D1" />
          <stop offset="50%" stopColor="#CB96B1" />
          <stop offset="100%" stopColor="#9C6B84" />
        </linearGradient>
      </defs>

      {/* Part 1: Outer Q Loop & The 3 Horizontal Tiers and Spine of E */}
      <path
        d="M 52 16 C 55 16 57 17.5 58 20 L 46 32 C 45 33 43.5 33.5 42 33.5 L 34 33.5 C 31 33.5 28.5 36 28.5 39 L 28.5 46 L 48 46 C 50.5 46 52 47.5 52 50 L 52 52 C 52 54.5 50.5 56 48 56 L 28.5 56 L 28.5 65 C 28.5 68 31 70.5 34 70.5 L 56 70.5 C 58 70.5 60 72 61 74 L 66 82 C 64 83.5 61 84 57 84 L 32 84 C 20 84 14 76 14 65 L 14 35 C 14 24 20 16 32 16 L 52 16 Z"
        fill="url(#qae_ribbon_main)"
      />

      {/* Part 2: The A (Ascending diagonal, apex, and right leg) */}
      <path
        d="M 58 18 C 61 14.5 66 14.5 69 18 L 96 66 C 98.5 70 98 75 94.5 78 L 88 83 C 84.5 85.5 80 84.5 77.5 81 L 63 56 L 53 40 L 58 18 Z"
        fill="url(#qae_ribbon_leg)"
      />

      {/* Part 3: Option 1 Signature Overlapping Ribbon Fold (Forms Q Tail & connects base) */}
      <path
        d="M 38 65 C 41 62 46 62 49 64 L 76 80 C 79.5 82 81 86.5 79 90 L 75.5 96 C 73.5 99.5 69 101 65.5 99 L 44 86 C 41 84 39.5 80 41 76.5 L 43 72 C 44 70 43.5 67.5 41.5 66.5 L 38 65 Z"
        fill="url(#qae_ribbon_fold)"
      />

      {/* Part 4: Inner crossbar fold connecting the letters (Center bar of E & Crossbar of A) */}
      <path
        d="M 44 48 L 74 48 C 76.5 48 78 50 77 52.5 L 75 56 C 74 58 72 59 70 59 L 40 59 C 38 59 36.5 57.5 37 55.5 L 38 52 C 39 49.5 41.5 48 44 48 Z"
        fill="url(#qae_ribbon_fold)"
        opacity="0.92"
      />
    </svg>
  );
}

export default function LandingPortalPage() {
  const router = useRouter();
  const toast = useToast();

  const [qaModalOpen, setQaModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openQaModal = () => {
    setQaModalOpen(true);
    setPassword('');
    setErrorMsg('');
  };

  const closeQaModal = () => {
    if (isSubmitting) return;
    setQaModalOpen(false);
    setPassword('');
    setErrorMsg('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg('Please enter your workspace password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: 'qa',
          password: password.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.message || 'Authentication failed. Please verify your password.');
        setIsSubmitting(false);
        return;
      }

      toast.success('Signed into QA Workspace');
      router.push(data.redirectTo || '/dashboard');
    } catch {
      setErrorMsg('Connection error. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--background)',
        color: 'var(--foreground)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      {/* Floating Theme Toggle (top right, no top navigation bar) */}
      <div
        style={{
          position: 'absolute',
          top: 24,
          right: 28,
          zIndex: 10,
        }}
      >
        <ThemeToggle />
      </div>

      {/* Main Centered Container */}
      <main
        style={{
          width: '100%',
          maxWidth: 780,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {/* Brand Header */}
        <div style={{ marginBottom: 44 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 2,
            }}
          >
            <QAERibbonLogo size={140} />
          </div>
          <h1
            style={{
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: '-0.025em',
              margin: '0 0 8px 0',
              color: 'var(--foreground)',
            }}
          >
            QAE Studio
          </h1>
          <p
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: 'var(--foreground-muted)',
              margin: 0,
            }}
          >
            Test Management Workspace
          </p>
        </div>

        {/* Two Rounded Workspace Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
            gap: 24,
            width: '100%',
            marginBottom: 36,
          }}
        >
          {/* Card 1: QA Workspace */}
          <div
            className="card"
            style={{
              padding: '36px 28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              borderRadius: 16,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              boxShadow: 'var(--shadow-sm)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'var(--surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary)',
                marginBottom: 20,
              }}
            >
              <ShieldCheck size={32} />
            </div>

            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--foreground)',
                margin: '0 0 6px 0',
              }}
            >
              QA Workspace
            </h2>

            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--primary)',
                marginBottom: 10,
              }}
            >
              Manage Your Testing Workflow
            </div>

            <p
              style={{
                fontSize: 14,
                color: 'var(--foreground-muted)',
                lineHeight: 1.5,
                margin: '0 0 28px 0',
                flex: 1,
                maxWidth: 260,
              }}
            >
              Full access to QA tools and project data
            </p>

            <button
              id="btn-signin-qa"
              type="button"
              className="btn btn-primary"
              onClick={openQaModal}
              style={{
                width: '100%',
                padding: '12px 20px',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: 10,
              }}
            >
              <span>Sign in as QA</span>
              <ArrowRight size={16} />
            </button>
          </div>

          {/* Card 2: Project Overview */}
          <div
            className="card"
            style={{
              padding: '36px 28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              borderRadius: 16,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              boxShadow: 'var(--shadow-sm)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'var(--surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary)',
                marginBottom: 20,
              }}
            >
              <BarChart size={32} />
            </div>

            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--foreground)',
                margin: '0 0 6px 0',
              }}
            >
              Project Overview
            </h2>

            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--primary)',
                marginBottom: 10,
              }}
            >
              For Developers, PMs & Management
            </div>

            <p
              style={{
                fontSize: 14,
                color: 'var(--foreground-muted)',
                lineHeight: 1.5,
                margin: '0 0 28px 0',
                flex: 1,
                maxWidth: 260,
              }}
            >
              View dashboard, test cases and testing progress
            </p>

            <button
              id="btn-continue-dev-pm"
              type="button"
              className="btn btn-secondary"
              onClick={() => router.push('/project-viewer')}
              style={{
                width: '100%',
                padding: '12px 20px',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: 10,
              }}
            >
              <span>Continue to Project Overview</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* Minimal Footer */}
        <footer
          style={{
            fontSize: 12,
            color: 'var(--foreground-dim)',
          }}
        >
          QAE Studio · Personal Test Management Workspace
        </footer>
      </main>

      {/* Password-Only Modal for QA Workspace */}
      <Modal
        isOpen={qaModalOpen}
        onClose={closeQaModal}
        title="Sign in to QA Workspace"
      >
        <form onSubmit={handleSubmit}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'var(--surface-2)',
                color: 'var(--primary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}
            >
              <Lock size={20} />
            </div>
            <p style={{ fontSize: 13, color: 'var(--foreground-muted)', margin: 0, lineHeight: 1.5 }}>
              Enter the QA Workspace password to access authoring, test execution, and administrative tools.
            </p>
          </div>

          {/* Password-Only Field (No username required) */}
          <div className="form-group" style={{ marginBottom: 18 }}>
            <label className="form-label" htmlFor="workspace-password-input">
              Password
            </label>
            <input
              id="workspace-password-input"
              type="password"
              className="form-control"
              placeholder="Enter password"
              value={password}
              autoFocus
              disabled={isSubmitting}
              onChange={e => {
                setPassword(e.target.value);
                setErrorMsg('');
              }}
            />
            {errorMsg && (
              <div
                style={{
                  color: 'var(--error)',
                  fontSize: 12,
                  marginTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeQaModal}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              id="btn-submit-password"
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !password.trim()}
              style={{ minWidth: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="spinner" />
                  <span>Verifying...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
