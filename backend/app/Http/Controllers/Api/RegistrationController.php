<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Registration;
use Illuminate\Support\Facades\Log;

class RegistrationController extends Controller
{

    public function index()
    {
        $registrations = Registration::orderBy('created_at', 'desc')->get([
            'nik',
            'name',
            'phone_number',
            'branch',
            'purchase_date',
            'status', // status: SUCCESS, FAILED
            'ticket_number', // ANTM-MOCKUP-001 atau null
            'created_at',
        ]);

        return response()->json([
            'success' => true,
            'data' => $registrations
        ]);
    }
    /**
     * Menerima hasil pendaftaran dari Bot Engine (Node.js)
     */
    public function store(Request $request)
    {
        // 1. Validasi Data
        $validatedData = $request->validate([
            'name' => 'required|string|max:255',
            'nik' => 'required|string|size:16|unique:registrations,nik', // Pastikan NIK unik
            'phone_number' => 'required|string|max:20',
            'branch' => 'required|string|max:100',
            'purchase_date' => 'required|date_format:Y-m-d',
            'status' => 'required|in:SUCCESS,FAILED,BLOCKED', // Status dari hasil bot
            'ticket_number' => 'nullable|string|max:50',
            'raw_response' => 'nullable|array', // Response mentah dari Antam
            'war_time' => 'required|date_format:Y-m-d H:i:s', // Waktu eksekusi
        ]);

        // 2. Simpan ke Database
        try {
            $registration = Registration::create($validatedData);

            // 3. Pemicu Notifikasi WA (Fase 5)
            // Di sini nanti kita akan memanggil Job Queue untuk mengirim notifikasi WA
            \App\Jobs\SendWhatsAppNotification::dispatch($registration);
            
            return response()->json([
                'message' => 'Registration result saved successfully.',
                'registration_id' => $registration->id,
                'status' => $registration->status,
            ], 201);

        } catch (\Exception $e) {
            // Log error jika ada masalah saat menyimpan
            Log::error("Failed to save registration: " . $e->getMessage(), $validatedData);
            return response()->json([
                'message' => 'Server error: Failed to save data.',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}