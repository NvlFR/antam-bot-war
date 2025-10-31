<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Registration;
use Illuminate\Support\Facades\Log;
// Import Facade Validator dan Rule
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

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
        // Daftar semua status yang mungkin dikirim dari bot
        $allowedStatuses = [
            'SUCCESS', 
            'FAILED', 
            'BLOCKED', 
            'FAILED_UNKNOWN', 
            'FAILED_CRITICAL', 
            'FAILED_STOCK', 
            'FAILED_ALREADY_REGISTERED', 
            'FAILED_VALIDATION',
            'FAILED_HISTORY' // Status yang kita tambahkan di bot untuk riwayat
        ];
        
        // 1. Validasi Data menggunakan Validator Facade
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            
            // --- IMPLEMENTASI SOLUSI A: VALIDASI NIK BERSYARAT ---
            'nik' => [
                'required', 
                'string', 
                'size:16', 
                // NIK hanya unik JIKA sudah ada di DB dengan status 'SUCCESS'
                Rule::unique('registrations', 'nik')->where(function ($query) {
                    return $query->where('status', 'SUCCESS'); 
                }),
            ],
            // --- AKHIR SOLUSI A ---

            'phone_number' => 'required|string|max:20',
            'branch' => 'required|string|max:100',
            'purchase_date' => 'required|date_format:Y-m-d',
            // Perluas status yang diterima
            'status' => ['required', Rule::in($allowedStatuses)], 
            'ticket_number' => 'nullable|string|max:50',
            // Ubah 'array' menjadi 'nullable' karena response bisa berupa string JSON dari bot
            'raw_response' => 'nullable', 
            'war_time' => 'required|date_format:Y-m-d H:i:s',
            
            // Tambahkan validasi untuk Solusi B (opsional/fail-safe dari bot)
            'original_nik' => 'nullable|string|size:16', 
        ]);
        
        // Cek hasil validasi
        if ($validator->fails()) {
            // Log error validasi
            Log::warning("Validation failed for registration data.", $validator->errors()->toArray());
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $validator->errors(),
            ], 422); // Status 422 agar bot tahu ini Validation Error
        }

        // Ambil data yang sudah divalidasi
        $validatedData = $validator->validated();

        // 2. Simpan ke Database
        try {
            // Jika raw_response berupa string JSON dari bot, kita perlu meng-encode-nya ke array jika DB Anda mengharapkan JSON
            if (isset($validatedData['raw_response']) && is_string($validatedData['raw_response'])) {
                // Asumsi bot mengirimkan string JSON yang perlu di-decode.
                // Jika bot mengirim array/objek langsung, tidak perlu decode.
                // Mari kita biarkan Laravel mengurus casting-nya jika model sudah diset.
            }
            
            $registration = Registration::create($validatedData);

            // 3. Pemicu Notifikasi WA (Fase 5) - Biarkan kode ini tetap
            // \App\Jobs\SendWhatsAppNotification::dispatch($registration); 
            
            return response()->json([
                'message' => 'Registration result saved successfully.',
                'registration_id' => $registration->id,
                'status' => $registration->status,
            ], 201);

        } catch (\Exception $e) {
            Log::error("Failed to save registration: " . $e->getMessage(), $validatedData);
            return response()->json([
                'message' => 'Server error: Failed to save data.',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}