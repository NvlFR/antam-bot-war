<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\RegistrationController;

Route::post('/bot/test-connection', function (Request $request) {
    if ($request->input('status') === 'success') {
        return response()->json([
            'message' => 'API Connection Successful! Data Received (via api.php).',
            'timestamp' => now()->toDateTimeString(),
            'received_data' => $request->all()
        ], 200);
    }
    return response()->json([
        'message' => 'API Connection Successful, but data is incomplete.',
    ], 200);
});

Route::post('/bot/save-result', [RegistrationController::class, 'store']);