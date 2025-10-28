<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Registration extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     * Kolom yang bisa diisi oleh input bot.
     */
    protected $fillable = [
        'name',
        'nik',
        'phone_number',
        'branch',
        'purchase_date',
        'status',
        'ticket_number',
        'raw_response',
        'war_time',
    ];

    /**
     * The attributes that should be cast.
     * Kolom 'raw_response' akan otomatis diubah ke array/object PHP.
     */
    protected $casts = [
        'raw_response' => 'array',
        'purchase_date' => 'date',
        'war_time' => 'datetime',
    ];
}