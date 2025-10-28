<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use App\Models\Registration;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SendWhatsAppNotification implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $registration;

    /**
     * Create a new job instance.
     */
    public function __construct(Registration $registration)
    {
        $this->registration = $registration;
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        $data = $this->registration;
        
        // Format pesan WhatsApp
        $message = "🎉 *Pendaftaran Antrian Antam Berhasil!* 🎉\n\n";
        $message .= "*Nama:* {$data->name}\n";
        $message .= "*NIK:* {$data->nik}\n";
        $message .= "*Cabang:* {$data->branch}\n";
        $message .= "*Tanggal Antrian:* {$data->purchase_date->format('d F Y')}\n";
        $message .= "*Nomor Tiket:* *{$data->ticket_number}*\n\n";
        $message .= "Mohon hadir tepat waktu. Terima kasih.";
        
        // KRITIS: Mengirim permintaan POST ke Baileys Worker (port 3000)
        $response = Http::post('http://127.0.0.1:3000/send-message', [
            'to' => $data->phone_number, // Nomor HP
            'message' => $message         // Isi pesan
        ]);

        if ($response->successful()) {
            Log::info("WhatsApp message sent successfully for ID: {$data->id}");
        } else {
            // Jika gagal, log error dan Job akan di-retry
            Log::error("Failed to send WhatsApp message for ID: {$data->id}", ['response' => $response->body()]);
            $this->fail();
        }
    }
}