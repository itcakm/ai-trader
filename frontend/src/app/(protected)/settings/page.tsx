'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useTradingStore } from '@/stores/trading-store';

function WalletSection() {
  const { totalDeposited, deposits, positions, addDeposit, addWithdrawal, resetAllData } = useTradingStore();
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amount, setAmount] = useState('');
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const usedMargin = positions.reduce((sum, p) => sum + p.entryPrice * p.amount, 0);
  const availableBalance = totalDeposited - usedMargin;

  const handleDeposit = () => {
    const depositAmount = parseFloat(amount);
    if (depositAmount > 0) {
      addDeposit(depositAmount);
      setAmount('');
      setShowDeposit(false);
    }
  };

  const handleWithdraw = () => {
    const withdrawAmount = parseFloat(amount);
    if (withdrawAmount > 0 && withdrawAmount <= availableBalance) {
      addWithdrawal(withdrawAmount);
      setAmount('');
      setShowWithdraw(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Wallet Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-500">Total Deposited</p>
              <p className="text-2xl font-bold">${totalDeposited.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">In Positions</p>
              <p className="text-2xl font-bold">${usedMargin.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Available</p>
              <p className="text-2xl font-bold text-green-600">${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          {(showDeposit || showWithdraw) ? (
            <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h4 className="font-medium">{showDeposit ? 'Make a Deposit' : 'Withdraw Funds'}</h4>
              <div>
                <label className="block text-sm font-medium mb-1">Amount (USD)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  placeholder="Enter amount"
                  min="0"
                  max={showWithdraw ? availableBalance : undefined}
                />
              </div>
              <div className="flex gap-2">
                {[1000, 5000, 10000, 25000].map((preset) => (
                  <Button
                    key={preset}
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(Math.min(preset, showWithdraw ? availableBalance : preset).toString())}
                    disabled={showWithdraw && preset > availableBalance}
                  >
                    ${preset.toLocaleString()}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => { setShowDeposit(false); setShowWithdraw(false); setAmount(''); }}>
                  Cancel
                </Button>
                <Button
                  onClick={showDeposit ? handleDeposit : handleWithdraw}
                  disabled={!amount || parseFloat(amount) <= 0 || (showWithdraw && parseFloat(amount) > availableBalance)}
                >
                  {showDeposit ? 'Deposit' : 'Withdraw'} ${amount ? parseFloat(amount).toLocaleString() : '0'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button onClick={() => setShowDeposit(true)}>Deposit</Button>
              <Button variant="outline" onClick={() => setShowWithdraw(true)} disabled={availableBalance <= 0}>
                Withdraw
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {deposits.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No transactions yet</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {deposits.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className={`text-xl ${tx.type === 'deposit' ? 'text-green-500' : 'text-red-500'}`}>
                      {tx.type === 'deposit' ? '↓' : '↑'}
                    </span>
                    <div>
                      <p className="font-medium capitalize">{tx.type}</p>
                      <p className="text-sm text-gray-500">{new Date(tx.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${tx.type === 'deposit' ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.type === 'deposit' ? '+' : '-'}${tx.amount.toLocaleString()}
                    </p>
                    <Badge variant={tx.status === 'completed' ? 'success' : tx.status === 'pending' ? 'warning' : 'error'}>
                      {tx.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-red-600">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            Reset all trading data including strategies, positions, orders, and deposits. This action cannot be undone.
          </p>
          {showConfirmReset ? (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowConfirmReset(false)}>Cancel</Button>
              <Button variant="outline" className="text-red-600 border-red-600" onClick={() => { resetAllData(); setShowConfirmReset(false); }}>
                Confirm Reset
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="text-red-600" onClick={() => setShowConfirmReset(true)}>
              Reset All Data
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AccountSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Account Type</p>
            <p className="font-medium">Individual</p>
          </div>
          <div>
            <p className="text-gray-500">Status</p>
            <Badge variant="success">Active</Badge>
          </div>
          <div>
            <p className="text-gray-500">Email Verified</p>
            <p className="font-medium">Yes</p>
          </div>
          <div>
            <p className="text-gray-500">Member Since</p>
            <p className="font-medium">{new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<'wallet' | 'account'>('wallet');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your wallet and account</p>
      </div>

      <div className="flex gap-2 border-b dark:border-gray-700 pb-2">
        <Button variant={tab === 'wallet' ? 'primary' : 'ghost'} onClick={() => setTab('wallet')}>
          💰 Wallet
        </Button>
        <Button variant={tab === 'account' ? 'primary' : 'ghost'} onClick={() => setTab('account')}>
          👤 Account
        </Button>
      </div>

      {tab === 'wallet' ? <WalletSection /> : <AccountSection />}
    </div>
  );
}
