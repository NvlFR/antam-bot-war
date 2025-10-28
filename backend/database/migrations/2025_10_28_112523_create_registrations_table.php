<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
public function up(): void
{
    Schema::create('registrations', function (Blueprint $table) {
        $table->id();
        $table->string('name');
        $table->string('nik')->unique();
        $table->string('phone_number');
        $table->string('branch'); // Cabang Butik Antam
        $table->date('purchase_date'); // Tanggal antrian yang diminta
        $table->string('status')->default('PENDING'); // PENDING, SUCCESS, FAILED, BLOCKED
        $table->string('ticket_number')->nullable(); // Nomor tiket jika sukses
        $table->json('raw_response')->nullable(); // Response mentah dari Antam
        $table->timestamp('war_time'); // Waktu eksekusi bot
        $table->timestamps();
    });
}

public function down(): void
{
    Schema::dropIfExists('registrations');
}
};
