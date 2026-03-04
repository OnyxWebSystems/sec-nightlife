import React, { useState } from 'react';
import { invokeFunction } from '@/services/integrationService';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Ticket, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

export default function TicketPurchaseButton({ event }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePurchase = async () => {
    if (!selectedTier) {
      toast.error('Please select a ticket type');
      return;
    }

    // Check if running in iframe
    if (window.self !== window.top) {
      toast.error('Checkout only works from the published app, not in preview mode');
      return;
    }

    setIsProcessing(true);
    try {
      const { data } = await invokeFunction('createCheckoutSession', {
        event_id: event.id,
        ticket_tier_name: selectedTier,
        quantity: quantity
      });

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Failed to start checkout. Please try again.');
      setIsProcessing(false);
    }
  };

  const availableTickets = event.ticket_tiers?.filter(t => 
    (t.quantity - (t.sold || 0)) > 0
  ) || [];

  const selectedTierData = event.ticket_tiers?.find(t => t.name === selectedTier);
  const maxQuantity = selectedTierData ? Math.min(selectedTierData.quantity - (selectedTierData.sold || 0), 10) : 1;
  const totalPrice = selectedTierData ? selectedTierData.price * quantity : 0;

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="w-full bg-gradient-to-r from-[#FF3366] to-[#7C3AED]"
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
                        onValueChange={(val) => setQuantity(parseInt(val))}
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
                        className="w-full bg-gradient-to-r from-[#FF3366] to-[#7C3AED]"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <CreditCard className="w-4 h-4 mr-2" />
                        )}
                        {isProcessing ? 'Processing...' : 'Proceed to Payment'}
                      </Button>

                      <p className="text-xs text-gray-500 text-center mt-2">
                        Secure payment powered by Stripe
                      </p>
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