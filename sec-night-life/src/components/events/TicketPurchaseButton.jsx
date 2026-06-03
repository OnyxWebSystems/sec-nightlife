import React, { useEffect, useState } from 'react';
import { apiPost } from '@/api/client';
import * as authService from '@/services/authService';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Ticket, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import RefundPolicyNote from '@/components/legal/RefundPolicyNote';
import { launchPaystackInline, verifyPaystackReference } from '@/lib/paystackInline';

export default function TicketPurchaseButton({ event }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [holderNames, setHolderNames] = useState(['']);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setHolderNames((prev) => {
      const next = [...prev];
      while (next.length < quantity) next.push('');
      return next.slice(0, quantity);
    });
  }, [quantity]);

  const availableTickets = event.ticket_tiers?.filter(t =>
    (t.quantity - (t.sold || 0)) > 0
  ) || [];

  const selectedTierData = event.ticket_tiers?.find(t => t.name === selectedTier);
  const maxQuantity = selectedTierData ? Math.min(selectedTierData.quantity - (selectedTierData.sold || 0), 10) : 1;
  const totalPrice = selectedTierData ? selectedTierData.price * quantity : 0;

  const handlePurchase = async () => {
    if (!selectedTier) {
      toast.error('Please select a ticket type');
      return;
    }
    if (quantity > 1) {
      for (let i = 0; i < quantity; i++) {
        const parts = String(holderNames[i] || '').trim().split(/\s+/).filter(Boolean);
        if (parts.length < 2) {
          toast.error(`Enter first and surname for ticket ${i + 1}`);
          return;
        }
      }
    }

    if (window.self !== window.top) {
      toast.error('Checkout only works from the published app, not in preview mode');
      return;
    }

    setIsProcessing(true);
    try {
      const user = await authService.getCurrentUser();
      const names =
        quantity > 1
          ? holderNames.map((n) => String(n).trim())
          : [holderDisplayNameFromUser(user)];
      const res = await apiPost('/api/payments/initialize', {
        amount: totalPrice,
        email: user?.email,
        description: `${event.title} - ${selectedTier} x${quantity}`,
        event_id: event.id,
        metadata: {
          type: 'ticket',
          event_id: event.id,
          ticket_tier_name: selectedTier,
          quantity: String(quantity),
          holder_names: JSON.stringify(names),
        },
      });
      if (res?.reference && res?.access_code) {
        await launchPaystackInline({
          email: user?.email,
          amount: totalPrice,
          reference: res.reference,
          accessCode: res.access_code,
          onSuccess: async (payload) => {
            await verifyPaystackReference(payload?.reference || res.reference);
            toast.success('Payment successful — your tickets are in Profile');
            setIsOpen(false);
          },
          onCancel: () => toast.message('Checkout cancelled'),
        });
      } else {
        throw new Error('No payment URL returned');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error(error?.data?.error || error?.message || 'Failed to start checkout. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  function holderDisplayNameFromUser(u) {
    const n = u?.fullName || u?.username || u?.userProfile?.username;
    return n ? String(n).trim() : 'Guest';
  }

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="w-full sec-btn-accent"
      >
        <Ticket className="w-4 h-4 mr-2" />
        Buy Tickets
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="bg-[#141416] border-[#262629] text-white">
          <DialogHeader>
            <DialogTitle className="gradient-text">Purchase Tickets</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div>
              <Label className="text-gray-400 text-sm">Event</Label>
              <p className="text-white font-semibold mt-1">{event.title}</p>
            </div>

            {availableTickets.length === 0 ? (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                No tickets available for this event
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-gray-400 text-sm mb-2 block">Ticket Type</Label>
                  <Select value={selectedTier} onValueChange={setSelectedTier}>
                    <SelectTrigger className="bg-[#0A0A0B] border-[#262629]">
                      <SelectValue placeholder="Select ticket type" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#141416] border-[#262629] text-white">
                      {availableTickets.map((tier) => (
                        <SelectItem key={tier.name} value={tier.name}>
                          {tier.name} - R{tier.price} ({tier.quantity - (tier.sold || 0)} left)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedTier && (
                  <>
                    <div>
                      <Label className="text-gray-400 text-sm mb-2 block">Quantity</Label>
                      <Select
                        value={quantity.toString()}
                        onValueChange={(val) => setQuantity(parseInt(val, 10))}
                      >
                        <SelectTrigger className="bg-[#0A0A0B] border-[#262629]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#141416] border-[#262629] text-white">
                          {Array.from({ length: maxQuantity }, (_, i) => i + 1).map((num) => (
                            <SelectItem key={num} value={num.toString()}>
                              {num} {num === 1 ? 'ticket' : 'tickets'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {quantity > 1 ? (
                      <div className="space-y-2">
                        <Label className="text-gray-400 text-sm">Guest name per ticket</Label>
                        {Array.from({ length: quantity }, (_, i) => (
                          <Input
                            key={i}
                            placeholder={`Ticket ${i + 1}: First name & surname`}
                            value={holderNames[i] || ''}
                            onChange={(e) => {
                              const next = [...holderNames];
                              next[i] = e.target.value;
                              setHolderNames(next);
                            }}
                            className="bg-[#0A0A0B] border-[#262629]"
                          />
                        ))}
                      </div>
                    ) : null}

                    {selectedTierData?.description && (
                      <div className="p-3 rounded-lg bg-[#0A0A0B]">
                        <p className="text-xs text-gray-400">{selectedTierData.description}</p>
                      </div>
                    )}

                    <div className="pt-4 border-t border-[#262629]">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-gray-400">Total</span>
                        <span className="text-2xl font-bold text-white">R{totalPrice.toLocaleString()}</span>
                      </div>

                      <Button
                        onClick={handlePurchase}
                        disabled={isProcessing}
                        className="w-full sec-btn-accent"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <CreditCard className="w-4 h-4 mr-2" />
                        )}
                        {isProcessing ? 'Processing...' : 'Proceed to Payment'}
                      </Button>

                      <p className="text-xs text-gray-500 text-center mt-2">
                        Secure payment powered by Paystack
                      </p>
                      <RefundPolicyNote className="text-center mt-2" style={{ color: 'rgb(107 114 128)' }} />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
