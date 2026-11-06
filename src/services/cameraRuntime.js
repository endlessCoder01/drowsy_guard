import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Keep native-only hooks and modules out of Expo Go and web execution.
const isExpoGo = Platform.OS !== 'web' && Constants.executionEnvironment === 'storeClient';
const canLoadNativeCamera = Platform.OS !== 'web' && !isExpoGo;
let useCameraDevice = () => null;
let VisionCamera = null;
let useFrameProcessor = () => null;
let useFaceDetector = () => ({ detectFaces: () => [] });
let useTensorflowModel = () => ({ state: 'error', model: undefined });
let useResizePlugin = () => ({ resize: () => null });
let Worklets = null;
let nativeCameraModulesAvailable = false;

if (canLoadNativeCamera) {
  try {
    ({ Camera: VisionCamera, useCameraDevice, useFrameProcessor } = require('react-native-vision-camera'));
    ({ useFaceDetector } = require('react-native-vision-camera-face-detector'));
    ({ Worklets } = require('react-native-worklets-core'));
    ({ useTensorflowModel } = require('react-native-fast-tflite'));
    ({ useResizePlugin } = require('vision-camera-resize-plugin'));
    nativeCameraModulesAvailable = true;
  } catch (error) {
    console.warn('Native camera modules are unavailable. Camera monitoring is disabled.', error);
  }
}

export const EYE_MODEL = require('../../assets/eye_state_cnn.tflite');

export {
  isExpoGo, canLoadNativeCamera, nativeCameraModulesAvailable,
  VisionCamera, useCameraDevice, useFrameProcessor, useFaceDetector,
  useTensorflowModel, useResizePlugin, Worklets,
};
