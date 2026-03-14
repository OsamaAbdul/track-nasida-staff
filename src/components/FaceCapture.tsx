
import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FaceCaptureProps {
  onCapture: (descriptor: Float32Array) => void;
  mode: 'enroll' | 'verify';
}

const FaceCapture: React.FC<FaceCaptureProps> = ({ onCapture, mode }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isWarming, setIsWarming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [livenessStep, setLivenessStep] = useState<'idle' | 'straight' | 'turning' | 'success'>('idle');
  const [livenessFeedback, setLivenessFeedback] = useState('Position your face');
  const [yawValue, setYawValue] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setIsModelLoaded(true);
      } catch (error) {
        console.error('Error loading models:', error);
        toast({
          title: 'Model Loading Failed',
          description: 'Make sure face-api models are in /public/models',
          variant: 'destructive',
        });
      }
    };
    loadModels();
  }, [toast]);

  useEffect(() => {
    if (isModelLoaded && !isCapturing) {
      startVideo();
    }
  }, [isModelLoaded]);

  useEffect(() => {
    let mounted = true;
    const preWarm = async () => {
      if (isCapturing && videoRef.current && !isWarming) {
        try {
          // Ensure video is actually playing before pre-warm
          if (videoRef.current.paused || videoRef.current.ended) {
            await new Promise((resolve) => {
              if (videoRef.current) {
                videoRef.current.onplay = resolve;
              }
            });
          }
          
          if (!mounted) return;
          setIsWarming(true);
          
          // Dummy detection to "pre-warm" the engine
          await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions());
        } catch (e) {
          console.warn("Pre-warm calibration issue:", e);
        } finally {
          if (mounted) setIsWarming(false);
        }
      }
    };
    preWarm();
    return () => { mounted = false; };
  }, [isCapturing]);

  // Liveness Tracker Logic
  useEffect(() => {
    let intervalId: any;
    if (isCapturing && isModelLoaded && !loading && livenessStep !== 'success') {
      intervalId = setInterval(async () => {
        if (!videoRef.current) return;
        
        try {
          const detection = await faceapi
            .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks();

          if (!detection) {
            setLivenessFeedback('Face not detected');
            return;
          }

          const landmarks = detection.landmarks;
          const nose = landmarks.getNose()[0];
          const leftEye = landmarks.getLeftEye()[0];
          const rightEye = landmarks.getRightEye()[0];
          
          // Simple Yaw Calculation (Nose position relative to eyes)
          const eyeCenterX = (leftEye.x + rightEye.x) / 2;
          const yaw = (nose.x - eyeCenterX) / (rightEye.x - leftEye.x);
          setYawValue(yaw);

          if (livenessStep === 'idle' || livenessStep === 'straight') {
            if (Math.abs(yaw) < 0.1) {
              setLivenessStep('turning');
              setLivenessFeedback('Now, slowly turn your head LEFT');
            } else {
              setLivenessStep('straight');
              setLivenessFeedback('Look straight at the camera');
            }
          } else if (livenessStep === 'turning') {
            if (yaw < -0.4) {
              setLivenessStep('success');
              setLivenessFeedback('Liveness Verified! Hold still...');
              setTimeout(() => {
                 handleCapture();
              }, 800);
            }
          }
        } catch (e) {
          console.warn("Liveness analysis issue:", e);
        }
      }, 200);
    }
    return () => clearInterval(intervalId);
  }, [isCapturing, isModelLoaded, livenessStep, loading]);

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 }, 
          height: { ideal: 480 },
          frameRate: { ideal: 20 }
        } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCapturing(true);
        setLivenessStep('idle');
        setLivenessFeedback('Look straight at the camera');
      }
    } catch (error) {
      console.error('Error starting video:', error);
      toast({
        title: 'Camera Error',
        description: 'Could not access your camera. Please ensure permissions are granted.',
        variant: 'destructive',
      });
    }
  };

  const handleCapture = async () => {
    setLoading(true);
    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection && videoRef.current) {
        onCapture(detection.descriptor);
        // Stop video stream safely
        const stream = videoRef.current.srcObject as MediaStream;
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        setIsCapturing(false);
        toast({
          title: 'Face Captured',
          description: mode === 'enroll' ? 'Face successfully enrolled.' : 'Face verified.',
        });
      } else if (!detection) {
        toast({
          title: 'Face Not Detected',
          description: 'Please ensure your face is clearly visible.',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 border rounded-xl bg-card relative min-h-[300px]">
      {!isModelLoaded && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl">
          <RefreshCw className="h-8 w-8 animate-spin text-primary mb-2" />
          <p className="text-sm font-bold uppercase tracking-widest animate-pulse">Initializing AI Models...</p>
        </div>
      )}

      <div className="relative w-full max-w-md aspect-video bg-black rounded-lg overflow-hidden shadow-inner border">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
        />
        {!isCapturing && isModelLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-xs font-bold uppercase tracking-widest">Activating Camera...</p>
          </div>
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          <div className="px-2 py-0.5 rounded bg-black/50 backdrop-blur-md border border-white/10 text-[8px] font-black uppercase text-white tracking-widest">
            {isModelLoaded ? 'AI Ready' : 'AI Loading'}
          </div>
        </div>

        {/* Liveness Overlay */}
        {isCapturing && (
          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 to-transparent flex flex-col items-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <p className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-300 ${livenessStep === 'success' ? 'text-green-400' : 'text-white/70'}`}>
                {livenessFeedback}
              </p>
              {livenessStep === 'turning' && (
                <div className="flex items-center gap-4 text-primary animate-pulse">
                  <span className="text-xl">←</span>
                  <div className="h-0.5 w-12 bg-white/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300" 
                      style={{ width: `${Math.min(100, Math.max(0, -yawValue * 100 * 2))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            
            <div className="w-full max-w-[180px] h-1 bg-white/10 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ease-out ${livenessStep === 'success' ? 'bg-green-500' : 'bg-primary'}`}
                style={{ 
                  width: livenessStep === 'success' ? '100%' : 
                         livenessStep === 'turning' ? '66%' : 
                         livenessStep === 'straight' ? '33%' : '5%' 
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col w-full gap-2">
        <Button 
          onClick={handleCapture} 
          disabled={!isCapturing || loading || livenessStep !== 'success'} 
          className="h-12 font-black uppercase tracking-widest shadow-lg hover:shadow-primary/20 transition-all duration-300 active:scale-95 overflow-hidden group"
        >
          {loading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
          ) : livenessStep === 'success' ? (
            <div className="flex items-center gap-2 text-green-400 animate-pulse">
               <div className="h-2 w-2 rounded-full bg-green-500" />
               Capturing...
            </div>
          ) : (
            <>
              <Camera className="h-4 w-4 mr-2 group-hover:rotate-12 transition-transform" />
              {mode === 'enroll' ? 'Begin Enrollment' : 'Start Liveness Check'}
            </>
          )}
        </Button>
        <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold tracking-tighter opacity-50 hover:opacity-100" onClick={() => {
          if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(t => t.stop());
          }
          window.location.reload();
        }}>
          Reset Connection
        </Button>
      </div>
    </div>
  );
};

export default FaceCapture;
