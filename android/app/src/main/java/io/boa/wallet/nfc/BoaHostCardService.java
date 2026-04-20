package io.boa.wallet.nfc;

import android.nfc.cardemulation.HostApduService;
import android.os.Bundle;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

public class BoaHostCardService extends HostApduService {

    public static final String AID_HEX = "F0394148148100";
    private static final byte[] SELECT_OK_SW = hexStringToByteArray("9000");
    private static final byte[] UNKNOWN_CMD_SW = hexStringToByteArray("6D00");
    private static final byte[] ERROR_SW = hexStringToByteArray("6F00");
    private static final byte[] CONDITIONS_NOT_SATISFIED_SW = hexStringToByteArray("6985");
    private static final byte[] READ_PROFILE_APDU = hexStringToByteArray("80CA000000");

    private static volatile String currentPayload;

    public static void setCurrentPayload(String payload) {
        currentPayload = payload;
    }

    public static void clearCurrentPayload() {
        currentPayload = null;
    }

    public static boolean hasCurrentPayload() {
        return currentPayload != null && !currentPayload.isEmpty();
    }

    @Override
    public byte[] processCommandApdu(byte[] commandApdu, Bundle extras) {
        if (commandApdu == null) {
            return ERROR_SW;
        }

        if (isSelectAidApdu(commandApdu)) {
            return SELECT_OK_SW;
        }

        if (Arrays.equals(commandApdu, READ_PROFILE_APDU)) {
            if (!hasCurrentPayload()) {
                return CONDITIONS_NOT_SATISFIED_SW;
            }

            byte[] payloadBytes = currentPayload.getBytes(StandardCharsets.UTF_8);
            if (payloadBytes.length > 220) {
                return ERROR_SW;
            }

            return concat(payloadBytes, SELECT_OK_SW);
        }

        return UNKNOWN_CMD_SW;
    }

    @Override
    public void onDeactivated(int reason) {
        // No-op.
    }

    private static boolean isSelectAidApdu(byte[] commandApdu) {
        byte[] header = hexStringToByteArray("00A40400");
        if (commandApdu.length < header.length + 1) {
            return false;
        }

        byte[] prefix = Arrays.copyOf(commandApdu, header.length);
        if (!Arrays.equals(prefix, header)) {
            return false;
        }

        int aidLength = commandApdu[4] & 0xFF;
        int expectedLength = header.length + 1 + aidLength;
        if (commandApdu.length < expectedLength) {
            return false;
        }

        byte[] aidBytes = Arrays.copyOfRange(commandApdu, 5, 5 + aidLength);
        return Arrays.equals(aidBytes, hexStringToByteArray(AID_HEX));
    }

    private static byte[] concat(byte[] first, byte[] second) {
        byte[] result = new byte[first.length + second.length];
        System.arraycopy(first, 0, result, 0, first.length);
        System.arraycopy(second, 0, result, first.length, second.length);
        return result;
    }

    public static byte[] getReadProfileApdu() {
        return Arrays.copyOf(READ_PROFILE_APDU, READ_PROFILE_APDU.length);
    }

    public static byte[] buildSelectApdu() {
        byte[] aidBytes = hexStringToByteArray(AID_HEX);
        byte[] command = new byte[5 + aidBytes.length];
        command[0] = 0x00;
        command[1] = (byte) 0xA4;
        command[2] = 0x04;
        command[3] = 0x00;
        command[4] = (byte) aidBytes.length;
        System.arraycopy(aidBytes, 0, command, 5, aidBytes.length);
        return command;
    }

    private static byte[] hexStringToByteArray(String value) {
        int len = value.length();
        byte[] data = new byte[len / 2];
        for (int index = 0; index < len; index += 2) {
            data[index / 2] = (byte) ((Character.digit(value.charAt(index), 16) << 4)
                + Character.digit(value.charAt(index + 1), 16));
        }
        return data;
    }
}
