/**
 * SHG Tracker - Client-side Helpers
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Live Loan Calculation Preview on Loan Request Form
  const amountInput = document.getElementById('amountRequested');
  const tenureInput = document.getElementById('tenureMonths');
  const rateInput = document.getElementById('interestRate');

  if (amountInput && tenureInput) {
    const previewContainer = document.getElementById('calculatorPreview');
    const previewPrincipal = document.getElementById('previewPrincipal');
    const previewInterest = document.getElementById('previewInterest');
    const previewTotal = document.getElementById('previewTotal');
    const previewInstalment = document.getElementById('previewInstalment');

    function updatePreview() {
      const p = parseFloat(amountInput.value) || 0;
      const t = parseInt(tenureInput.value, 10) || 0;
      const r = parseFloat(rateInput ? rateInput.value : (amountInput.dataset.rate || 12)) || 12;

      if (p >= 500 && t >= 1) {
        // Simple Interest: (P * R * (T / 12)) / 100
        const interest = Math.round(((p * r * (t / 12)) / 100) * 100) / 100;
        const total = Math.round((p + interest) * 100) / 100;
        const instalment = Math.round((total / t) * 100) / 100;

        if (previewPrincipal) previewPrincipal.textContent = `₹${p.toLocaleString('en-IN')}`;
        if (previewInterest) previewInterest.textContent = `₹${interest.toLocaleString('en-IN')}`;
        if (previewTotal) previewTotal.textContent = `₹${total.toLocaleString('en-IN')}`;
        if (previewInstalment) previewInstalment.textContent = `₹${instalment.toLocaleString('en-IN')} / month`;

        if (previewContainer) previewContainer.style.display = 'block';
      } else {
        if (previewContainer) previewContainer.style.display = 'none';
      }
    }

    amountInput.addEventListener('input', updatePreview);
    tenureInput.addEventListener('input', updatePreview);
    if (rateInput) rateInput.addEventListener('input', updatePreview);
    updatePreview();
  }

  // 2. Role Selector on Register Page
  const roleSelect = document.getElementById('role');
  const adminGroupFields = document.getElementById('adminGroupFields');
  const memberGroupFields = document.getElementById('memberGroupFields');

  if (roleSelect && adminGroupFields) {
    function toggleRoleFields() {
      if (roleSelect.value === 'admin') {
        adminGroupFields.style.display = 'block';
        if (memberGroupFields) memberGroupFields.style.display = 'none';
      } else {
        adminGroupFields.style.display = 'none';
        if (memberGroupFields) memberGroupFields.style.display = 'block';
      }
    }
    roleSelect.addEventListener('change', toggleRoleFields);
    toggleRoleFields();
  }

  // 3. Modal / Dialog open helpers
  const repaymentDialog = document.getElementById('repaymentDialog');
  const openRepayButtons = document.querySelectorAll('.btn-open-repay');

  if (repaymentDialog && openRepayButtons.length > 0) {
    openRepayButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const instalmentId = btn.dataset.instalmentId;
        const instalmentNumber = btn.dataset.instalmentNumber;
        const amountDue = btn.dataset.amountDue;

        document.getElementById('repayInstalmentId').value = instalmentId;
        document.getElementById('repayInstalmentNumber').textContent = instalmentNumber;
        document.getElementById('repayAmountDue').textContent = `₹${amountDue}`;
        document.getElementById('repayAmountInput').value = amountDue;

        repaymentDialog.showModal();
      });
    });

    const closeRepayBtn = document.getElementById('closeRepayDialog');
    if (closeRepayBtn) {
      closeRepayBtn.addEventListener('click', () => {
        repaymentDialog.close();
      });
    }
  }

  // 4. Decision Modal for Admin Approving/Rejecting Loan
  const decisionDialog = document.getElementById('decisionDialog');
  const openDecisionButtons = document.querySelectorAll('.btn-open-decision');

  if (decisionDialog && openDecisionButtons.length > 0) {
    openDecisionButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const loanId = btn.dataset.loanId;
        const memberName = btn.dataset.memberName;
        const amount = btn.dataset.amount;
        const tenure = btn.dataset.tenure;
        const rate = btn.dataset.rate;

        const form = document.getElementById('decisionForm');
        form.action = `/loans/${loanId}/decision`;

        document.getElementById('modalMemberName').textContent = memberName;
        document.getElementById('modalLoanAmount').textContent = `₹${Number(amount).toLocaleString('en-IN')}`;
        document.getElementById('modalTenure').textContent = `${tenure} months`;
        document.getElementById('modalRateInput').value = rate;

        decisionDialog.showModal();
      });
    });

    const closeDecisionBtn = document.getElementById('closeDecisionDialog');
    if (closeDecisionBtn) {
      closeDecisionBtn.addEventListener('click', () => {
        decisionDialog.close();
      });
    }

    // Toggle rejection reason field
    const decisionRadios = document.querySelectorAll('input[name="decision"]');
    const rejectionBox = document.getElementById('rejectionReasonBox');
    const approvalBox = document.getElementById('approvalDetailsBox');

    decisionRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        if (radio.value === 'rejected' && radio.checked) {
          if (rejectionBox) rejectionBox.style.display = 'block';
          if (approvalBox) approvalBox.style.display = 'none';
        } else if (radio.value === 'approved' && radio.checked) {
          if (rejectionBox) rejectionBox.style.display = 'none';
          if (approvalBox) approvalBox.style.display = 'block';
        }
      });
    });
  }

  // --- UPI Targeted Deep Link URL Generator ---
  function generateTargetedUpiUrl(appName, baseUpiUri) {
    if (!baseUpiUri) return '';
    const queryString = baseUpiUri.includes('?') ? baseUpiUri.substring(baseUpiUri.indexOf('?') + 1) : '';
    if (!queryString) return baseUpiUri;

    const isAndroid = /Android/i.test(navigator.userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    const packages = {
      gpay: 'com.google.android.apps.nbu.paisa.user',
      phonepe: 'com.phonepe.app',
      paytm: 'net.one97.paytm',
      bhim: 'in.org.npci.upiapp',
      whatsapp: 'com.whatsapp'
    };

    const iosSchemes = {
      gpay: 'gpay://upi/pay?',
      phonepe: 'phonepe://pay?',
      paytm: 'paytmmp://pay?',
      bhim: 'bhim://pay?',
      whatsapp: 'whatsapp://pay?'
    };

    if (appName === 'other') {
      return `upi://pay?${queryString}`;
    }

    // Android Intent format with explicit package ensures WhatsApp cannot intercept!
    if (isAndroid && packages[appName]) {
      const pkg = packages[appName];
      const fallback = encodeURIComponent(`https://play.google.com/store/apps/details?id=${pkg}`);
      return `intent://pay?${queryString}#Intent;scheme=upi;package=${pkg};S.browser_fallback_url=${fallback};end`;
    }

    // iOS custom schemes
    if (isIOS && iosSchemes[appName]) {
      return `${iosSchemes[appName]}${queryString}`;
    }

    // Fallback for Android-compatible browsers or intent handling
    if (packages[appName]) {
      const pkg = packages[appName];
      return `intent://pay?${queryString}#Intent;scheme=upi;package=${pkg};end`;
    }

    return `upi://pay?${queryString}`;
  }

  // 5. Member Online UPI Repayment Dialog
  const memberUpiDialog = document.getElementById('memberUpiDialog');
  const openMemberUpiButtons = document.querySelectorAll('.btn-open-member-upi');
  let currentLoanUpiUri = '';

  if (memberUpiDialog && openMemberUpiButtons.length > 0) {
    const upiAppBtn = document.getElementById('memberModalUpiAppBtn');
    const memberUpiAppChooser = document.getElementById('memberUpiAppChooser');
    const memberUpiChevron = document.getElementById('memberUpiChevron');
    const memberUpiStatusMsg = document.getElementById('memberUpiStatusMsg');

    openMemberUpiButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const instalmentId = btn.dataset.instalmentId;
        const instalmentNumber = btn.dataset.instalmentNumber;
        const amountDue = btn.dataset.amountDue;
        const dueDate = btn.dataset.dueDate;
        const qrCode = btn.dataset.qrCode;
        currentLoanUpiUri = btn.dataset.upiUri || '';

        document.getElementById('memberModalInstalmentId').value = instalmentId;
        document.getElementById('memberModalInstalmentNumber').textContent = instalmentNumber;
        document.getElementById('memberModalAmountDue').textContent = `₹${Number(amountDue).toLocaleString('en-IN')}`;
        document.getElementById('memberModalDueDate').textContent = dueDate;
        document.getElementById('memberModalAmountInput').value = amountDue;

        const qrImg = document.getElementById('memberModalQrImg');
        if (qrImg && qrCode) {
          qrImg.src = qrCode;
          qrImg.style.display = 'inline-block';
        } else if (qrImg) {
          qrImg.style.display = 'none';
        }

        // Reset App Chooser to initial clean state
        if (memberUpiAppChooser) memberUpiAppChooser.style.display = 'none';
        if (memberUpiChevron) memberUpiChevron.textContent = '▼';
        if (memberUpiStatusMsg) memberUpiStatusMsg.style.display = 'none';
        if (memberUpiAppChooser) {
          memberUpiAppChooser.querySelectorAll('.btn-upi-app-card').forEach((c) => c.classList.remove('selected'));
        }

        if (upiAppBtn && currentLoanUpiUri) {
          upiAppBtn.style.display = 'flex';
        } else if (upiAppBtn) {
          upiAppBtn.style.display = 'none';
        }

        memberUpiDialog.showModal();
      });
    });

    // Toggle App Chooser Drawer on button click
    if (upiAppBtn && memberUpiAppChooser) {
      upiAppBtn.addEventListener('click', () => {
        const isHidden = memberUpiAppChooser.style.display === 'none' || !memberUpiAppChooser.style.display;
        memberUpiAppChooser.style.display = isHidden ? 'block' : 'none';
        if (memberUpiChevron) {
          memberUpiChevron.textContent = isHidden ? '▲' : '▼';
        }
      });
    }

    // App card selection and targeted redirection
    if (memberUpiAppChooser) {
      const appCards = memberUpiAppChooser.querySelectorAll('.btn-upi-app-card');
      appCards.forEach((card) => {
        card.addEventListener('click', () => {
          const app = card.dataset.app;
          const appName = card.dataset.name;
          const targetUrl = generateTargetedUpiUrl(app, currentLoanUpiUri);

          appCards.forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');

          if (memberUpiStatusMsg) {
            memberUpiStatusMsg.style.display = 'flex';
            const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            if (isMobile) {
              memberUpiStatusMsg.innerHTML = `<span>⏳</span> <span>Opening <strong>${appName}</strong>... After payment, enter your 12-digit UTR below.</span>`;
            } else {
              memberUpiStatusMsg.innerHTML = `<span>📱</span> <span>Launching <strong>${appName}</strong>. (On desktop, you can also scan the QR code above with your phone).</span>`;
            }
          }

          // Automatically focus the UTR input box for seamless confirmation
          const utrInput = document.getElementById('memberModalTransactionId');
          if (utrInput) {
            utrInput.focus();
          }

          // Redirect to the chosen app
          if (targetUrl) {
            window.location.href = targetUrl;
          }
        });
      });
    }

    const closeMemberUpiBtn = document.getElementById('closeMemberUpiDialog');
    if (closeMemberUpiBtn) {
      closeMemberUpiBtn.addEventListener('click', () => memberUpiDialog.close());
    }

    const cancelMemberUpiBtn = document.getElementById('cancelMemberUpiBtn');
    if (cancelMemberUpiBtn) {
      cancelMemberUpiBtn.addEventListener('click', () => memberUpiDialog.close());
    }

    const copyUpiIdBtn = document.getElementById('copyUpiIdBtn');
    const upiIdText = document.getElementById('memberModalUpiIdText');
    if (copyUpiIdBtn && upiIdText) {
      copyUpiIdBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(upiIdText.textContent.trim()).then(() => {
          const originalText = copyUpiIdBtn.textContent;
          copyUpiIdBtn.textContent = '✓ Copied!';
          copyUpiIdBtn.classList.add('btn-primary');
          copyUpiIdBtn.classList.remove('btn-outline-primary');
          setTimeout(() => {
            copyUpiIdBtn.textContent = originalText;
            copyUpiIdBtn.classList.remove('btn-primary');
            copyUpiIdBtn.classList.add('btn-outline-primary');
          }, 2000);
        });
      });
    }
  }

  // 6. Member Monthly Savings UPI Deposit Dialog
  const savingsUpiDialog = document.getElementById('savingsUpiDialog');
  const openSavingsUpiBtns = document.querySelectorAll('#openSavingsUpiBtn, .open-savings-upi-trigger');

  if (savingsUpiDialog && openSavingsUpiBtns.length > 0) {
    const savingsUpiAppBtn = document.getElementById('savingsModalUpiAppBtn');
    const savingsUpiAppChooser = document.getElementById('savingsUpiAppChooser');
    const savingsUpiChevron = document.getElementById('savingsUpiChevron');
    const savingsUpiStatusMsg = document.getElementById('savingsUpiStatusMsg');

    openSavingsUpiBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        // Reset App Chooser state
        if (savingsUpiAppChooser) savingsUpiAppChooser.style.display = 'none';
        if (savingsUpiChevron) savingsUpiChevron.textContent = '▼';
        if (savingsUpiStatusMsg) savingsUpiStatusMsg.style.display = 'none';
        if (savingsUpiAppChooser) {
          savingsUpiAppChooser.querySelectorAll('.btn-upi-app-card').forEach((c) => c.classList.remove('selected'));
        }
        savingsUpiDialog.showModal();
      });
    });

    // Toggle App Chooser Drawer on button click
    if (savingsUpiAppBtn && savingsUpiAppChooser) {
      savingsUpiAppBtn.addEventListener('click', () => {
        const isHidden = savingsUpiAppChooser.style.display === 'none' || !savingsUpiAppChooser.style.display;
        savingsUpiAppChooser.style.display = isHidden ? 'block' : 'none';
        if (savingsUpiChevron) {
          savingsUpiChevron.textContent = isHidden ? '▲' : '▼';
        }
      });

      const savingsAppCards = savingsUpiAppChooser.querySelectorAll('.btn-upi-app-card');
      savingsAppCards.forEach((card) => {
        card.addEventListener('click', () => {
          const app = card.dataset.app;
          const appName = card.dataset.name;
          const savingsUpiUri = savingsUpiAppBtn.dataset.upiUri || '';
          const targetUrl = generateTargetedUpiUrl(app, savingsUpiUri);

          savingsAppCards.forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');

          if (savingsUpiStatusMsg) {
            savingsUpiStatusMsg.style.display = 'flex';
            const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            if (isMobile) {
              savingsUpiStatusMsg.innerHTML = `<span>⏳</span> <span>Opening <strong>${appName}</strong>... After payment, enter your 12-digit UTR below.</span>`;
            } else {
              savingsUpiStatusMsg.innerHTML = `<span>📱</span> <span>Launching <strong>${appName}</strong>. (On desktop, you can also scan the QR code above with your phone).</span>`;
            }
          }

          const utrInput = document.getElementById('savingsTransactionId');
          if (utrInput) {
            utrInput.focus();
          }

          if (targetUrl) {
            window.location.href = targetUrl;
          }
        });
      });
    }

    const closeSavingsUpiBtn = document.getElementById('closeSavingsUpiDialog');
    if (closeSavingsUpiBtn) {
      closeSavingsUpiBtn.addEventListener('click', () => savingsUpiDialog.close());
    }

    const cancelSavingsUpiBtn = document.getElementById('cancelSavingsUpiBtn');
    if (cancelSavingsUpiBtn) {
      cancelSavingsUpiBtn.addEventListener('click', () => savingsUpiDialog.close());
    }

    const copySavingsUpiIdBtn = document.getElementById('copySavingsUpiIdBtn');
    const savingsUpiIdText = document.getElementById('savingsModalUpiIdText');
    if (copySavingsUpiIdBtn && savingsUpiIdText) {
      copySavingsUpiIdBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(savingsUpiIdText.textContent.trim()).then(() => {
          const orig = copySavingsUpiIdBtn.textContent;
          copySavingsUpiIdBtn.textContent = '✓ Copied!';
          setTimeout(() => {
            copySavingsUpiIdBtn.textContent = orig;
          }, 2000);
        });
      });
    }
  }

  // 7. Password Visibility Toggle (Show / Hide Password)
  document.querySelectorAll('.btn-toggle-password').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = targetId ? document.getElementById(targetId) : btn.parentElement.querySelector('input');
      if (!input) return;

      const eyeOpen = btn.querySelector('.eye-open-icon');
      const eyeClosed = btn.querySelector('.eye-closed-icon');

      if (input.type === 'password') {
        input.type = 'text';
        btn.setAttribute('title', 'Hide password');
        btn.setAttribute('aria-label', 'Hide password');
        if (eyeOpen) eyeOpen.style.display = 'none';
        if (eyeClosed) eyeClosed.style.display = 'block';
      } else {
        input.type = 'password';
        btn.setAttribute('title', 'Show password');
        btn.setAttribute('aria-label', 'Show password');
        if (eyeOpen) eyeOpen.style.display = 'block';
        if (eyeClosed) eyeClosed.style.display = 'none';
      }
      input.focus();
    });
  });

  // 8. Prevent Browser Autofill on Login Page
  const loginEmail = document.getElementById('email');
  const loginPassword = document.getElementById('password');

  if (loginEmail && loginPassword && document.querySelector('.auth-card form[action="/login"]')) {
    let userHasInteracted = false;

    const markInteracted = () => {
      userHasInteracted = true;
      loginEmail.removeAttribute('readonly');
      loginPassword.removeAttribute('readonly');
    };

    ['keydown', 'input', 'mousedown', 'touchstart', 'focus'].forEach((evt) => {
      loginEmail.addEventListener(evt, markInteracted, { passive: true });
      loginPassword.addEventListener(evt, markInteracted, { passive: true });
    });

    const clearAutofillIfUntouched = () => {
      if (!userHasInteracted) {
        if (loginEmail.value) loginEmail.value = '';
        if (loginPassword.value) loginPassword.value = '';
      }
    };

    // Execute multiple sweeps to catch Chrome/browser delayed autofill injection
    clearAutofillIfUntouched();
    setTimeout(clearAutofillIfUntouched, 50);
    setTimeout(clearAutofillIfUntouched, 150);
    setTimeout(clearAutofillIfUntouched, 300);
    setTimeout(clearAutofillIfUntouched, 600);
    setTimeout(clearAutofillIfUntouched, 1000);

    // Remove readonly attribute after initial load completes so keyboard tab navigation works normally
    setTimeout(() => {
      loginEmail.removeAttribute('readonly');
      loginPassword.removeAttribute('readonly');
    }, 1200);
  }

  // Demo Credentials Quick-Fill Chips on Login Page
  document.querySelectorAll('.fill-demo-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const emailInput = document.getElementById('email');
      const passwordInput = document.getElementById('password');
      if (emailInput && btn.dataset.email) {
        emailInput.removeAttribute('readonly');
        emailInput.value = btn.dataset.email;
      }
      if (passwordInput && btn.dataset.password) {
        passwordInput.removeAttribute('readonly');
        passwordInput.value = btn.dataset.password;
      }
      if (passwordInput) {
        passwordInput.focus();
      }
    });
  });
});


