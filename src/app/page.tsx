'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Users, Lock, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

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
              width: 50,
              height: 50,
              borderRadius: 12,
              background: 'var(--primary)',
              color: '#FFFFFF',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 700,
              marginBottom: 16,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            ⬡
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
            QA Studio
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
                margin: '0 0 10px 0',
              }}
            >
              QA Workspace
            </h2>

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

          {/* Card 2: Developer & PM Workspace */}
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
              <Users size={32} />
            </div>

            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--foreground)',
                margin: '0 0 10px 0',
              }}
            >
              Developer & PM Workspace
            </h2>

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
              <span>Continue as Developer & PM</span>
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
          QA Studio · Personal Test Management Workspace
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
